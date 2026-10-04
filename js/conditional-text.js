// Bloc de texte conditionnel (menu des variables, onglet Chips) : un conteneur de blocs (paragraphes, titres, listes, tableaux, autres blocs
// conditionnels à toute profondeur) qui n'apparaît en lecture et à l'export que si sa condition est remplie. Le nœud est dans js/editor-nodes.js
// (createConditionalTextNode), la barre flottante dans js/floating-toolbars.js, la fenêtre de condition (celle d'une bulle) dans
// js/variable-condition.js. Ce fichier porte le reste : la pose du bloc dans l'éditeur (à la place de « #requête » ou autour du texte sélectionné),
// sa résolution au rendu et son défaire (le cadre et la condition partent, le texte reste).
//
// Résolution : js/reader-mode.js la fait une fois, après le déroulé des zones répétées et avant celle des bulles : le HTML rendu à la Lecture, au
// PDF, au Word, à l'e-mail et aux en-têtes/pieds est donc déjà sans bloc. Condition remplie : le cadre disparaît, son contenu reste. Sinon : le bloc
// et son contenu disparaissent, sans ligne vide. Pas de condition : toujours affiché. Condition illisible : masqué, comme une bulle.
const ConditionalText = (function () {
  const TYPE = 'conditionalText';
  const SELECTOR = 'div.conditional-text';

  // Défait chaque bloc de `root` dont la condition est remplie (le cadre disparaît, son contenu reste), retire les autres. Un bloc extérieur retiré
  // emporte les blocs qu'il contient, un bloc extérieur défait laisse les siens à leur verdict.
  function resolve(root, tableId, record) {
    return ConditionRules.resolveElements(root, SELECTOR, tableId, record, true, (block, holds) => {
      if (holds) block.replaceWith(...Array.from(block.childNodes));
      else LoopRules.removeAndPrune(block);
    });
  }

  // Plage de texte à entourer, retenue quand le bouton « Insérer une variable » ouvre la liste « # » sur du texte sélectionné (startFromSelection),
  // jusqu'au choix de « Texte conditionnel » ou à la fermeture de la liste. Suivie à travers les transactions : la requête tapée après « # » décale
  // le texte qui la suit.
  let pending = null; // { editor, from, to }

  function followTransaction({ transaction }) {
    if (!pending || !transaction.docChanged) return;
    // `from` passe derrière un texte tapé pile à cet endroit (la requête, quand le texte sélectionné commençait au début du paragraphe) ; `to` reste
    // devant.
    pending.from = transaction.mapping.map(pending.from, 1);
    pending.to = transaction.mapping.map(pending.to, -1);
  }
  function hasPending() { return !!pending; }
  function cancelPending() {
    if (!pending) return;
    pending.editor.off('transaction', followTransaction);
    pending = null;
  }
  function takePending() {
    const taken = pending ? { from: pending.from, to: pending.to } : null;
    cancelPending();
    return taken;
  }

  // Un texte sélectionné s'entoure ; tout autre cas (curseur seul, bulle ou image sélectionnée, cellules de tableau, bloc de code) garde le
  // déclenchement ordinaire du bouton. Le « # » se pose au début du paragraphe où commence la sélection, là où le préfixe d'un déclencheur est
  // toujours accepté (devant un mot collé, il ne le serait pas) ; le texte sélectionné n'est jamais remplacé. La liste s'ouvre sur l'onglet Chips,
  // « Texte conditionnel » en surbrillance (js/variables.js:preferChipsTab). Vrai quand c'est fait ici.
  function startFromSelection(editor) {
    const { selection } = editor.state;
    if (selection.empty || selection.toJSON().type !== 'text') return false;
    const { $from, $to } = selection;
    if ($from.parent.type.spec.code || $to.parent.type.spec.code || !$from.parent.isTextblock) return false;
    const trigger = Variables.triggerChar();
    const start = $from.start();
    cancelPending();
    // Les positions d'avant l'insertion du « # » : followTransaction les décale elle-même quand elle la voit passer.
    pending = { editor, from: selection.from, to: selection.to };
    editor.on('transaction', followTransaction);
    Variables.preferChipsTab();
    editor.chain().focus().insertContentAt(start, trigger).setTextSelection(start + trigger.length).run();
    return true;
  }

  // Plage de blocs à entourer pour une sélection de texte [from, to] : les blocs que la sélection touche ; si le bloc conditionnel ne peut pas y
  // aller (les éléments d'une liste ne l'acceptent pas comme premier enfant, ni une ligne de tableau), la plage remonte au bloc qui les contient - la
  // liste, le tableau entiers. null si rien ne convient.
  function wrappableRange(doc, from, to, type) {
    let range = doc.resolve(from).blockRange(doc.resolve(to));
    while (range) {
      const content = doc.slice(range.start, range.end).content;
      if (range.parent.canReplaceWith(range.startIndex, range.endIndex, type) && type.validContent(content)) return range;
      if (range.depth === 0) return null;
      const $start = doc.resolve(range.start);
      range = doc.resolve($start.before(range.depth)).blockRange(doc.resolve($start.after(range.depth)));
    }
    return null;
  }

  // Entoure les blocs de [from, to] d'un bloc conditionnel, dans la transaction `tr`. Rend la position du bloc, ou -1.
  function wrapInTransaction(tr, from, to) {
    const type = tr.doc.type.schema.nodes[TYPE];
    if (!type || !(from < to) || to > tr.doc.content.size) return -1;
    const range = wrappableRange(tr.doc, from, to, type);
    if (!range) return -1;
    tr.wrap(range, [{ type }]);
    return range.start;
  }

  // Un bloc vide à la place de « #requête » : à la place du paragraphe s'il n'en reste rien, avant lui si la requête était à son début, après si elle
  // était à sa fin, sinon le paragraphe est coupé en deux et le bloc se pose entre les deux moitiés. Un bloc qui ne peut pas aller là (premier enfant
  // d'un élément de liste) se pose après, puis après chaque bloc qui contient le paragraphe. Rend la position du bloc, ou -1.
  function insertEmptyInTransaction(tr, pos) {
    const { schema } = tr.doc.type;
    const type = schema.nodes[TYPE];
    if (!type) return -1;
    const block = type.create(null, schema.nodes.paragraph.create());
    const $pos = tr.doc.resolve(pos);
    let at = -1;
    if ($pos.parent.isTextblock && $pos.depth > 0) {
      const depth = $pos.depth;
      const container = $pos.node(depth - 1);
      const index = $pos.index(depth - 1);
      const size = $pos.parent.content.size;
      if (!size && container.canReplaceWith(index, index + 1, type)) {
        at = $pos.before(depth);
        tr.replaceWith(at, $pos.after(depth), block);
      } else if (size && $pos.parentOffset === 0 && container.canReplaceWith(index, index, type)) {
        at = $pos.before(depth);
        tr.insert(at, block);
      } else if (size && $pos.parentOffset === size && container.canReplaceWith(index + 1, index + 1, type)) {
        at = $pos.after(depth);
        tr.insert(at, block);
      } else if (size && $pos.parentOffset > 0 && $pos.parentOffset < size && container.canReplaceWith(index + 1, index + 1, type)) {
        tr.split(pos);
        at = pos + 1;
        tr.insert(at, block);
      } else {
        for (let d = depth; d >= 1 && at < 0; d--) {
          if ($pos.node(d - 1).canReplaceWith($pos.index(d - 1) + 1, $pos.index(d - 1) + 1, type)) { at = $pos.after(d); tr.insert(at, block); }
        }
      }
    }
    return at;
  }

  // Choix de « Texte conditionnel » dans la liste « # » : `range` est « #requête » (js/variables.js:command). Avec du texte retenu par
  // startFromSelection, le bloc l'entoure et la sélection reprend son texte ; sinon un bloc vide se pose et le curseur s'y met. Dans les deux cas,
  // « #requête » disparaît.
  function insertFromPanel(editor, range) {
    const { state, view } = editor;
    const TextSelection = EditorCore.getTextSelectionClass();
    const wrap = takePending();
    const tr = state.tr.delete(range.from, range.to);
    let at = -1;
    if (wrap) {
      const from = tr.mapping.map(wrap.from, 1);
      const to = tr.mapping.map(wrap.to, -1);
      at = wrapInTransaction(tr, from, to);
      // Le texte sélectionné reste sélectionné, une marque d'ouverture plus loin : le bloc s'ouvre juste avant lui.
      if (at >= 0) tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1));
    }
    if (at < 0) {
      at = insertEmptyInTransaction(tr, tr.mapping.map(range.from, -1));
      // Curseur dans le premier paragraphe du bloc : l'ouverture du bloc, puis celle du paragraphe.
      if (at >= 0) tr.setSelection(TextSelection.create(tr.doc, at + 2));
    }
    if (at < 0) { console.warn('[ConditionalText] aucun endroit où poser un bloc de texte conditionnel ici.'); return false; }
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  }

  // « Défaire le bloc » (fenêtre de condition, js/variable-condition.js) : le bloc qui commence à `pos` disparaît avec sa condition, son contenu
  // reste à sa place, en une seule transaction (un Ctrl+Z rend le bloc et sa condition). Le bloc est remplacé par son contenu, pas « levé » (tr.lift,
  // comme « Retirer l'encadré » de js/callout.js) : en mode suivi, la bibliothèque traduit une levée en texte barré dans le cadre et le même texte
  // inséré après lui, et le cadre, vide, reste une fois tout accepté ; un remplacement donne le bloc entier barré et son contenu inséré, donc « Tout
  // accepter » rend le document sans le bloc et « Tout refuser » celui d'avant. Le curseur se pose au début du texte libéré : la sélection du bloc ne
  // survit pas (mappée à travers le remplacement, elle prendrait le premier paragraphe pour un nœud sélectionné, que la frappe suivante
  // remplacerait). Faux, sans rien changer, si `pos` ne porte plus un bloc ou si son parent n'accepte pas ses blocs à sa place.
  function unwrap(editor, pos) {
    const { state, view } = editor;
    const node = state.doc.nodeAt(pos);
    if (!node || node.type.name !== TYPE) return false;
    const $pos = state.doc.resolve(pos);
    if (!$pos.parent.canReplace($pos.index(), $pos.index() + 1, node.content)) return false;
    const tr = state.tr.replaceWith(pos, pos + node.nodeSize, node.content);
    tr.setSelection(EditorCore.getTextSelectionClass().near(tr.doc.resolve(pos), 1));
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  // `takePending` sert aussi à la valeur conditionnelle (js/conditional-value.js) : le texte retenu par le bouton « Insérer une variable » peut être
  // entouré d'un bloc ou, dans un seul paragraphe, d'une valeur.
  return { resolve, startFromSelection, hasPending, cancelPending, takePending, insertFromPanel, unwrap };
})();
