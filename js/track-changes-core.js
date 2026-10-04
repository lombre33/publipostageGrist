// Suivi des modifications : les repères communs aux modules js/track-changes-*.js - les trois marques (leurs noms, le test, la marque d'une case ou d'une ligne de tableau), les marques
// Tiptap et le sérialiseur du schéma qui les écrivent, la bibliothèque une fois chargée et ce qu'on lit du document (une modification en attente, ses ids).
// Script classique, chargé avant les autres modules du suivi ; l'entrée reste js/track-changes.js (TrackChanges).
const TrackChangesCore = (function () {
  const MARK_NAMES = ['insertion', 'deletion', 'modification'];
  const isSuggestionMark = mark => MARK_NAMES.includes(mark.type.name);
  const suggestionMarksOf = node => node.marks.filter(isSuggestionMark);

  // Une marque de suivi posée sur une case de tableau (« Colonne avant / après », « Supprimer la colonne ») ou sur une ligne (« Ligne avant /
  // après », « Supprimer la ligne ») : ProseMirror l'écrit en <ins>/<del> autour du <td> (dans le <tr>) ou autour du <tr> (dans le <tbody>). Le HTML
  // enregistré ne peut pas garder cette forme : l'analyseur HTML du navigateur sort d'une ligne ou d'un corps de tableau tout élément étranger
  // (« foster parenting »), et la colonne ou la ligne supprimée revenait à la réouverture comme si de rien n'était. La marque s'écrit donc en
  // attribut de la case ou de la ligne (data-tc-insertion="3"), relu par les règles parseHTML des marques plus bas. La marque `modification`
  // (changement d'attribut : largeur d'une case fusionnée qui gagne une colonne, hauteur d'une case fusionnée qui gagne une ligne) y garde ses cinq
  // valeurs, en JSON.
  const CELL_NODE_TYPES = ['tableCell', 'tableHeader', 'tableRow'];
  const cellMarkAttribute = markName => 'data-tc-' + markName;
  const cellMarkValue = mark => JSON.stringify(mark.type.name === 'modification' ? mark.attrs : mark.attrs.id);

  // La bibliothèque et ses compagnons (prosemirror-model, -state, -tables), chargés par createExtensions() (js/track-changes.js), le seul endroit qui les importe : vide tant qu'il n'a
  // pas tourné. `suggestChangesKey`, la clé du plugin de la lib, sert à skipTracking() ; `TableMap`, la classe de prosemirror-tables, à retrouver les cases d'une même colonne
  // (expandSuggestionIds) ; le reste, aux commandes (js/track-changes-commands.js) et au pont (js/track-changes.js).
  const lib = {};

  // Un conteneur de bloc (doc, table, twoColumnsColumn, twoColumnsZone, cellule de tableau...) doit autoriser explicitement ces 3 marques sur ses
  // enfants directs pour qu'une suppression ou une insertion de bloc entier (pas seulement de texte) puisse se poser en marque de nœud
  // (tr.addNodeMark) sans que ProseMirror lève « Invalid content for node X » (cf. planning/feature-track-changes.md). Un nœud Tiptap est immutable :
  // `.extend(...)` renvoie une nouvelle définition, à utiliser à la place de l'originale dans `extensions: [...]`.
  function extendForTracking(nodeOrMarkExtension) {
    return nodeOrMarkExtension.extend({ marks: MARK_NAMES.join(' ') });
  }

  // Marque `tr` comme « déjà le résultat » : dispatchTransaction (js/track-changes.js) la laisse passer au lieu de la transformer en suggestion. Pour ce que le
  // widget écrit lui-même sans que la personne l'ait demandé (grille page des images en calque après un changement d'orientation,
  // HeaderFooterPreview.recaptureLayeredImageGrids) : suivie, l'écriture ressortait en suppression et insertion de l'image, à accepter ou refuser.
  // Rend `tr` (pour chaîner) ; sans suivi actif, la marque est sans effet.
  function skipTracking(tr) {
    return lib.suggestChangesKey ? tr.setMeta(lib.suggestChangesKey, { skip: true }) : tr;
  }

  // Vrai pour une transaction qui n'est pas une modification de la personne mais le résultat de ce qu'elle décrit : « Tout accepter » et « Tout
  // refuser » (et leurs variantes par suggestion ou par sélection), le chargement d'un document, une écriture marquée par skipTracking().
  // dispatchTransaction (js/track-changes.js) les laisse passer sans les suivre ; un plugin qui doit réagir à la résolution des suggestions (la valeur
  // conditionnelle vidée, js/editor-nodes.js) s'appuie sur la même marque.
  function isSkipped(tr) {
    const meta = lib.suggestChangesKey ? tr.getMeta(lib.suggestChangesKey) : null;
    return !!meta && 'skip' in meta;
  }

  function lastNodeCarriesSuggestionMark(state) {
    const last = state.doc.lastChild;
    return !!last && last.marks.some(isSuggestionMark);
  }

  // Vrai tant qu'un nœud du document porte une marque que `test` retient.
  function docHasMark(doc, test) {
    let found = false;
    doc.descendants(node => {
      if (found) return false;
      if (node.marks.some(test)) found = true;
      return !found;
    });
    return found;
  }
  const hasPendingSuggestions = state => docHasMark(state.doc, isSuggestionMark);
  // Vrai tant qu'une insertion ou une suppression (un texte, un objet, une case, une colonne, une ligne) attend : les modifications seules ne
  // comptent pas.
  const hasInsertionOrDeletion = doc => docHasMark(doc, mark => isSuggestionMark(mark) && mark.type.name !== 'modification');

  // L'ensemble des ids de suggestion présents dans le document, dédupliqués (un remplacement adjacent peut réutiliser le même id sur plusieurs
  // marques, cf. suggestReplaceStep dans planning/feature-track-changes.md). Convertis en chaîne : ce sont des clés d'objet JS, et
  // generateNextNumberId (dans la lib) produit des nombres.
  function collectPendingIds(state) {
    const ids = new Set();
    state.doc.descendants(node => {
      suggestionMarksOf(node).forEach(m => { if (m.attrs.id != null) ids.add(String(m.attrs.id)); });
    });
    return ids;
  }

  // Les trois marques du suivi, pour le schéma de l'éditeur (`Mark` et `mergeAttributes` viennent de @tiptap/core, passés par createExtensions).
  function createMarks(Mark, mergeAttributes) {
    // Une marque de suggestion : `<ins>` ou `<del>` portant l'id en data-id, ou l'attribut data-tc-* d'une case ou d'une ligne (cf.
    // CELL_NODE_TYPES) ; `consuming: false` laisse ensuite s'appliquer la règle de la case ou de la ligne (td, th, tr), la marque se posant sur le
    // nœud. `priority: 200` : le Strike de StarterKit reconnaît aussi <del>, sans priorité de règle explicite (50, le défaut ProseMirror) ; à
    // priorité de règle égale, l'ordre des marques dans le schéma tranche, dérivé de la priorité d'extension Tiptap (défaut 100). Sans ce relèvement,
    // StarterKit (déclaré en premier dans `extensions: [...]`) gagnerait la course au parsing de <del> et absorberait la marque de suivi, sans erreur
    // visible (aller-retour HTML).
    const suggestionMark = (name, tag, excludes) => Mark.create({
      name,
      priority: 200,
      inclusive: false,
      excludes,
      addAttributes() { return { id: { default: null } }; },
      parseHTML() {
        const cell = ['td', 'th', 'tr'].map(cellTag => `${cellTag}[${cellMarkAttribute(name)}]`).join(', ');
        return [
          { tag, getAttrs: el => (el.dataset.id ? { id: JSON.parse(el.dataset.id) } : false) },
          { tag: cell, consuming: false, getAttrs: el => ({ id: JSON.parse(el.getAttribute(cellMarkAttribute(name))) }) },
        ];
      },
      renderHTML({ HTMLAttributes }) { return [tag, { 'data-id': JSON.stringify(HTMLAttributes.id) }, 0]; },
    });
    const InsertionMark = suggestionMark('insertion', 'ins', 'deletion modification insertion');
    const DeletionMark = suggestionMark('deletion', 'del', 'insertion modification deletion');
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
    return { InsertionMark, DeletionMark, ModificationMark };
  }

  function createSerializerClass() {
    const { PMDOMSerializer, PMFragment } = lib;

    // Sérialiseur du schéma (celui de editor.getHTML(), du presse-papiers, des brouillons d'en-tête) : une case ou une ligne qui porte une marque de
    // suivi s'écrit avec la marque en attribut de l'élément au lieu d'un <ins>/<del> autour de lui (cf. CELL_NODE_TYPES). Tout autre fragment passe
    // tel quel par le sérialiseur d'origine.
    class TrackingDOMSerializer extends PMDOMSerializer {
      serializeFragment(fragment, options, target) {
        const isTrackedCell = node => CELL_NODE_TYPES.includes(node.type.name) && node.marks.some(isSuggestionMark);
        let anyTrackedCell = false;
        fragment.forEach(node => { if (isTrackedCell(node)) anyTrackedCell = true; });
        if (!anyTrackedCell) return super.serializeFragment(fragment, options, target);
        const bare = [];
        fragment.forEach(node => bare.push(isTrackedCell(node) ? node.mark(node.marks.filter(m => !isSuggestionMark(m))) : node));
        const out = super.serializeFragment(PMFragment.fromArray(bare), options);
        // Une case ou une ligne sérialisée = un élément : repli sur la forme d'origine si le compte n'y est pas, plutôt que d'écrire la marque sur le
        // mauvais élément.
        if (out.childNodes.length !== fragment.childCount) return super.serializeFragment(fragment, options, target);
        let index = 0;
        fragment.forEach(node => {
          const el = out.childNodes[index++];
          if (el.nodeType !== 1) return;
          suggestionMarksOf(node).forEach(m => el.setAttribute(cellMarkAttribute(m.type.name), cellMarkValue(m)));
        });
        if (!target) return out;
        target.appendChild(out);
        return target;
      }
    }
    return TrackingDOMSerializer;
  }

  return {
    MARK_NAMES, isSuggestionMark, suggestionMarksOf, CELL_NODE_TYPES, cellMarkAttribute, cellMarkValue, lib, extendForTracking, skipTracking, isSkipped, lastNodeCarriesSuggestionMark,
    hasPendingSuggestions, hasInsertionOrDeletion, collectPendingIds, createMarks, createSerializerClass,
  };
})();
