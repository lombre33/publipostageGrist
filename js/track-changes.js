// Suivi des modifications (mode suggestion façon Word/Google Docs) - pont entre Tiptap et
// @handlewithcare/prosemirror-suggest-changes@0.1.8. Intégration réelle du prototype
// prototypes/suivi-modifications.html (27 scénarios de tests verts avant intégration) - voir
// planning/feature-track-changes.md pour le cadrage complet, le diagnostic des bugs ci-dessous et
// les mesures de perf. Script classique (pas type="module"), même patron que js/editor-nodes.js :
// createExtensions() fait son propre import() dynamique, appelé depuis Editor.init() une fois
// Node/Mark/Extension/mergeAttributes disponibles (import de @tiptap/core).
const TrackChanges = (function () {
  const MARK_NAMES = ['insertion', 'deletion', 'modification'];

  // Une marque de suivi posée sur une CASE de tableau (« Colonne avant / après », « Supprimer la colonne ») ou sur une LIGNE (« Ligne avant / après », « Supprimer la ligne ») :
  // ProseMirror l'écrit en <ins>/<del> autour du <td> (donc directement dans le <tr>) ou autour du <tr> (donc directement dans le <tbody>). Le HTML enregistré ne peut pas
  // garder cette forme : l'analyseur HTML du navigateur sort de la ligne ou du corps du tableau tout élément étranger (« foster parenting »), la marque disparaissait à la
  // réouverture et la colonne ou la ligne supprimée revenait comme si de rien n'était. Elle s'écrit donc en attribut de la case ou de la ligne elle-même
  // (data-tc-insertion="3"), relu par les règles parseHTML des marques plus bas. La marque `modification` (changement d'attribut : la largeur d'une case fusionnée qui
  // gagne une colonne, la hauteur d'une case fusionnée qui gagne une ligne) y garde ses cinq valeurs, en JSON.
  const CELL_NODE_TYPES = ['tableCell', 'tableHeader', 'tableRow'];
  const cellMarkAttribute = markName => 'data-tc-' + markName;
  const cellMarkValue = mark => JSON.stringify(mark.type.name === 'modification' ? mark.attrs : mark.attrs.id);

  // Clé du plugin de la lib, gardée pour skipTracking() : createExtensions() est le seul endroit qui importe la lib. Null tant qu'il n'a pas tourné.
  let suggestKey = null;
  // Classe TableMap de prosemirror-tables, gardée de la même façon : elle sert à retrouver les cases d'une même colonne (expandSuggestionIds). Null
  // tant que createExtensions() n'a pas tourné.
  let TableMapClass = null;

  // Un conteneur de bloc (doc, table, twoColumnsColumn, twoColumnsZone, cellule de tableau...) doit
  // explicitement autoriser ces 3 marques sur ses enfants directs pour qu'une suppression/insertion
  // de BLOC ENTIER (pas seulement de texte inline) puisse être posée comme marque de nœud
  // (tr.addNodeMark) sans que ProseMirror ne lève "Invalid content for node X" - cf.
  // planning/feature-track-changes.md, bug n°1. Chaque nœud Tiptap est immutable : `.extend(...)`
  // renvoie une NOUVELLE définition, à utiliser à la place de l'originale dans `extensions: [...]`.
  function extendForTracking(nodeOrMarkExtension) {
    return nodeOrMarkExtension.extend({ marks: MARK_NAMES.join(' ') });
  }

  // Marque `tr` « déjà le résultat » : dispatchTransaction (plus bas) la laisse passer au lieu de la transformer en suggestion. Pour une transaction qui n'est
  // pas une modification de la personne mais le widget qui relit ce qu'il a lui-même écrit (grille page des images en calque après un changement d'orientation,
  // HeaderFooterPreview.recaptureLayeredImageGrids) : suivie, elle ressortait en une suppression + une insertion de l'image, à accepter ou refuser, que
  // personne n'avait faite. Rend `tr` (pour chaîner) ; sans suivi actif, la marque est sans effet.
  function skipTracking(tr) {
    return suggestKey ? tr.setMeta(suggestKey, { skip: true }) : tr;
  }

  // Vrai pour une transaction qui n'est PAS une modification de la personne mais le résultat de ce qu'elle décrit : « Tout accepter » et « Tout refuser » (et leurs variantes par suggestion
  // ou par sélection), le chargement d'un document, une écriture marquée par skipTracking(). dispatchTransaction (plus bas) les laisse passer sans les suivre ; un plugin qui doit
  // réagir à la RÉSOLUTION des suggestions (la valeur conditionnelle vidée, js/editor-nodes.js) s'appuie sur la même marque.
  function isSkipped(tr) {
    const meta = suggestKey ? tr.getMeta(suggestKey) : null;
    return !!meta && 'skip' in meta;
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

  // --- Accepter ou refuser UNE modification (barre flottante, js/floating-toolbars.js) -----------------------------------------------------------
  const suggestionMarksOf = node => node.marks.filter(m => MARK_NAMES.includes(m.type.name));
  const sameId = (a, b) => String(a) === String(b);
  // Une marque `modification` d'une case ou d'une ligne (la largeur d'une case fusionnée qui gagne une colonne) ne se voit pas dans l'éditeur : elle
  // ne déclenche jamais la barre « Accepter / Refuser », elle suit seulement la colonne ou la ligne dont elle fait partie (expandSuggestionIds).
  const isTableMod = (node, mark) => mark.type.name === 'modification' && CELL_NODE_TYPES.includes(node.type.name);

  // Les ids des suggestions que la sélection touche. Un curseur seul : le texte ou l'objet tout contre lui, celui d'AVANT d'abord (ce que le curseur
  // vient de franchir) ; à défaut, le bloc le plus profond qui porte une marque en remontant (la case d'une colonne suivie, la ligne, le paragraphe
  // supprimé en entier) - la suggestion la plus proche, jamais celle d'un bloc plus large qui ne fait que contenir le curseur. Une sélection : toutes
  // celles qu'elle recouvre. Vide quand il n'y en a aucune.
  function selectionSuggestionIds(state) {
    const { from, to, empty, $from } = state.selection;
    const ids = [];
    const take = node => suggestionMarksOf(node).forEach(mark => {
      if (mark.attrs.id == null || isTableMod(node, mark) || ids.some(id => sameId(id, mark.attrs.id))) return;
      ids.push(mark.attrs.id);
    });
    if (empty) {
      const near = [$from.nodeBefore, $from.nodeAfter].find(node => node && suggestionMarksOf(node).some(m => !isTableMod(node, m)));
      if (near) take(near);
    } else {
      // Un bloc qui contient toute la sélection (la case, la ligne, le tableau où elle se trouve) ne compte pas : il ne fait que l'entourer.
      state.doc.nodesBetween(from, to, (node, pos) => { if (node.isLeaf || pos >= from || pos + node.nodeSize <= to) take(node); });
    }
    for (let depth = $from.depth; depth > 0 && !ids.length; depth--) take($from.node(depth));
    return ids;
  }

  // Tout ce qui se résout avec les suggestions `seedIds` : leurs propres ids, plus, pour une colonne ou une ligne de tableau ajoutée ou supprimée
  // avec le suivi, ceux des autres cases de la colonne (une marque PAR CASE, chacune avec son id : n'en résoudre qu'une laisserait un tableau percé,
  // ou une colonne qui revient à la réouverture) et ceux des cases fusionnées dont la largeur (ou la hauteur) a changé avec elle - « Refuser » une
  // colonne ajoutée à travers une case fusionnée doit aussi lui rendre sa largeur, sans quoi prosemirror-tables « répare » le tableau en ajoutant des
  // cases vides. Rend une table id en texte -> id tel que le document l'écrit (la lib compare avec `===`).
  function expandSuggestionIds(doc, seedIds) {
    const ids = new Map();
    seedIds.forEach(id => ids.set(String(id), id));
    if (!TableMapClass) return ids;
    const seeds = [];
    doc.descendants((node, pos) => {
      if (!CELL_NODE_TYPES.includes(node.type.name)) return true;
      const own = suggestionMarksOf(node).find(m => m.type.name !== 'modification' && ids.has(String(m.attrs.id)));
      if (own) seeds.push({ pos, kind: own.type.name, isRow: node.type.name === 'tableRow' });
      return true;
    });
    seeds.forEach(({ pos, kind, isRow }) => {
      const $pos = doc.resolve(pos);
      let depth = $pos.depth;
      while (depth > 0 && $pos.node(depth).type.name !== 'table') depth--;
      if (!depth) return;
      const table = $pos.node(depth);
      const map = TableMapClass.get(table);
      const take = (cell, attrName) => cell && suggestionMarksOf(cell).forEach(m => {
        const sameKind = m.type.name === kind && !isRow;
        const sameSize = m.type.name === 'modification' && m.attrs.attrName === attrName;
        if (m.attrs.id != null && (sameKind || sameSize)) ids.set(String(m.attrs.id), m.attrs.id);
      });
      if (isRow) {
        const row = $pos.index(depth);
        for (let col = 0; col < map.width; col++) take(table.nodeAt(map.map[row * map.width + col]), 'rowspan');
      } else {
        const { left } = map.findCell(pos - $pos.start(depth));
        for (let row = 0; row < map.height; row++) take(table.nodeAt(map.map[row * map.width + left]), 'colspan');
      }
    });
    return ids;
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
  }

  async function createExtensions(Node, Mark, Extension, mergeAttributes) {
    const {
      suggestChanges, suggestChangesKey, toggleSuggestChanges, isSuggestChangesEnabled,
      applySuggestions, revertSuggestions, applySuggestion, revertSuggestion,
      transformToSuggestionTransaction,
    } = await import('@handlewithcare/prosemirror-suggest-changes');
    suggestKey = suggestChangesKey;
    const { DOMParser: PMDOMParser, DOMSerializer: PMDOMSerializer, Fragment: PMFragment } = await import('prosemirror-model');
    const { EditorState } = await import('prosemirror-state');
    TableMapClass = (await import('prosemirror-tables')).TableMap;
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
      parseHTML() {
        return [
          { tag: 'ins', getAttrs: el => (el.dataset.id ? { id: JSON.parse(el.dataset.id) } : false) },
          // `consuming: false` : la règle de la case ou de la ligne (td/th/tr) s'applique ensuite, la marque se posant sur le nœud (cf. CELL_NODE_TYPES).
          { tag: 'td[data-tc-insertion], th[data-tc-insertion], tr[data-tc-insertion]', consuming: false, getAttrs: el => ({ id: JSON.parse(el.getAttribute('data-tc-insertion')) }) },
        ];
      },
      renderHTML({ HTMLAttributes }) { return ['ins', { 'data-id': JSON.stringify(HTMLAttributes.id) }, 0]; },
    });
    const DeletionMark = Mark.create({
      name: 'deletion',
      priority: 200,
      inclusive: false,
      excludes: 'insertion modification deletion',
      addAttributes() { return { id: { default: null } }; },
      parseHTML() {
        return [
          { tag: 'del', getAttrs: el => (el.dataset.id ? { id: JSON.parse(el.dataset.id) } : false) },
          { tag: 'td[data-tc-deletion], th[data-tc-deletion], tr[data-tc-deletion]', consuming: false, getAttrs: el => ({ id: JSON.parse(el.getAttribute('data-tc-deletion')) }) },
        ];
      },
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
      parseHTML() {
        return [
          { tag: "span[data-type='modification']" },
          { tag: 'td[data-tc-modification], th[data-tc-modification], tr[data-tc-modification]', consuming: false, getAttrs: el => JSON.parse(el.getAttribute('data-tc-modification')) },
        ];
      },
      renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'modification', 'data-id': JSON.stringify(HTMLAttributes.id) }), 0]; },
    });

    // Sérialiseur du schéma (celui de editor.getHTML(), du presse-papiers, des brouillons d'en-tête) : une case ou une ligne qui porte une marque de suivi s'écrit avec la
    // marque en attribut de l'élément au lieu d'un <ins>/<del> autour de lui (cf. CELL_NODE_TYPES). Tout autre fragment passe tel quel par le sérialiseur d'origine.
    class TrackingDOMSerializer extends PMDOMSerializer {
      serializeFragment(fragment, options, target) {
        const isTrackedCell = node => CELL_NODE_TYPES.includes(node.type.name) && node.marks.some(m => MARK_NAMES.includes(m.type.name));
        let anyTrackedCell = false;
        fragment.forEach(node => { if (isTrackedCell(node)) anyTrackedCell = true; });
        if (!anyTrackedCell) return super.serializeFragment(fragment, options, target);
        const bare = [];
        fragment.forEach(node => bare.push(isTrackedCell(node) ? node.mark(node.marks.filter(m => !MARK_NAMES.includes(m.type.name))) : node));
        const out = super.serializeFragment(PMFragment.fromArray(bare), options);
        // Une case ou une ligne sérialisée = un élément : repli sur la forme d'origine si le compte n'y est pas, plutôt que d'écrire la marque sur le mauvais élément.
        if (out.childNodes.length !== fragment.childCount) return super.serializeFragment(fragment, options, target);
        let index = 0;
        fragment.forEach(node => {
          const el = out.childNodes[index++];
          if (el.nodeType !== 1) return;
          node.marks.forEach(m => { if (MARK_NAMES.includes(m.type.name)) el.setAttribute(cellMarkAttribute(m.type.name), cellMarkValue(m)); });
        });
        if (!target) return out;
        target.appendChild(out);
        return target;
      }
    }

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
      return withEndGuard(editor, () => libFn(editor.state, editor.view.dispatch));
    }

    // Exécute `run()` avec, au besoin, le garde-fou du dernier nœud du document.
    // Bug DANS LA LIB (pas notre code, cf. planning/feature-track-changes.md bug n°3) :
    // applySuggestions/revertSuggestions/applySuggestion/revertSuggestion plantent avec "Cannot read
    // properties of undefined (reading 'nodeSize')" quand le nœud traité est le tout DERNIER du
    // document (test de fusion avec le caractère suivant hors limites, `<=` au lieu de `<`).
    // Contournement : un paragraphe-tampon temporaire est inséré juste après, retiré ensuite s'il
    // est resté vide - les deux transactions de bord sont hors historique (invisibles pour Annuler).
    function withEndGuard(editor, run) {
      if (!lastNodeCarriesSuggestionMark(editor.state)) return run();
      const guardMeta = t => t.setMeta(suggestChangesKey, { skip: true }).setMeta('addToHistory', false);
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

    // Le document SANS ses marques « modification » : la seconde passe de applySuggestion/revertSuggestion (lib) résout toutes celles de la plage, de
    // n'importe quelle suggestion, sur des positions que la première passe a déjà décalées. Sur ce document-là elle n'a plus rien à toucher ; celles
    // de la suggestion visée se résolvent à part (resolveModifications). Les positions ne changent pas : une marque ne prend pas de place.
    function withoutModifications(doc, schema) {
      const strip = EditorState.create({ doc, schema }).tr;
      doc.descendants((node, pos) => {
        node.marks.forEach(mark => {
          if (mark.type.name !== 'modification') return;
          if (node.isText) strip.removeMark(pos, pos + node.nodeSize, mark); else strip.removeNodeMark(pos, mark);
        });
      });
      return strip.doc;
    }

    // Accepte ou refuse les suggestions `seedIds` et tout ce qui se résout avec elles (expandSuggestionIds), en UNE transaction : un seul Annuler, et
    // prosemirror-tables ne voit jamais un tableau à moitié résolu (il « répare » un tableau non rectangulaire en ajoutant des cases vides). Une
    // suggestion après l'autre par applySuggestion / revertSuggestion de la lib - que « Tout accepter » et « Tout refuser » appellent aussi, sans id et
    // par tranches -, sur une plage serrée et sur un état sans plugin (ses étapes sont rejouées sur la transaction finale, le document restant celui
    // d'origine). Rend faux, sans rien changer, quand rien n'est à résoudre ou quand une étape ne s'applique pas.
    function resolveSuggestionIds(editor, seedIds, accept) {
      const ids = expandSuggestionIds(editor.state.doc, seedIds);
      return withEndGuard(editor, () => {
        const { schema } = editor.state;
        const tr = editor.state.tr;
        const resolveOne = accept ? applySuggestion : revertSuggestion;
        try {
          ids.forEach(id => {
            const region = suggestionRegion(tr.doc, id);
            if (!region) return;
            let captured = null;
            resolveOne(id, region.from, region.to)(EditorState.create({ doc: withoutModifications(tr.doc, schema), schema }), t => { captured = t; });
            if (captured) captured.steps.forEach(step => tr.step(step));
          });
          resolveModifications(tr, ids, accept);
        } catch (e) {
          console.warn('[TrackChanges] suggestion non résolue :', e);
          return false;
        }
        if (!tr.docChanged) return false;
        editor.view.dispatch(tr.setMeta(suggestChangesKey, { skip: true }));
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
          // Une modification à la fois (barre flottante) : celle que la sélection touche, avec tout ce qui s'y résout (resolveSuggestionIds). Faux
          // sans rien changer quand la sélection n'en touche aucune.
          acceptSuggestionsAtSelection: () => ({ editor, dispatch, tr, state }) => resolveAtSelection(editor, state, dispatch, tr, true),
          rejectSuggestionsAtSelection: () => ({ editor, dispatch, tr, state }) => resolveAtSelection(editor, state, dispatch, tr, false),
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
            // Document inerte, nettoyé, jamais sérialisé : un <div> du widget, même détaché, ferait charger ses images (et courir leurs onerror) au premier innerHTML.
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
      // Bascule du suivi hors de la barre (une grille l'éteint à l'ouverture) : même appel direct de la lib que restoreSuggestModeIfNeeded, jamais la commande.
      toggleSuggestMode: editor => toggleSuggestChanges(editor.state, editor.view.dispatch),
      // À appeler une fois l'éditeur créé : DOMSerializer.fromSchema() relit schema.cached.domSerializer, tous les sérialiseurs du schéma passent donc par celui-ci.
      installSerializer(schema) {
        schema.cached.domSerializer = new TrackingDOMSerializer(PMDOMSerializer.nodesFromSchema(schema), PMDOMSerializer.marksFromSchema(schema));
      },
    };
  }

  return {
    extendForTracking, hasPendingSuggestions, computeMetadata, createExtensions, skipTracking, isSkipped, selectionSuggestionIds,
  };
})();
