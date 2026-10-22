// Bloc de texte conditionnel (menu des variables, onglet Chips) : un conteneur de blocs (paragraphes, titres, listes, tableaux, autres blocs
// conditionnels à toute profondeur) qui n'apparaît en lecture et à l'export que si sa condition est remplie. Le nœud est dans js/editor-nodes.js
// (createConditionalTextNode), la barre flottante dans js/floating-toolbars.js, la fenêtre de condition (celle d'une bulle) dans
// js/variable-condition.js. Ce fichier porte le reste : la pose du bloc dans l'éditeur (à la place de « #requête » ou autour du texte sélectionné),
// sa résolution au rendu et son défaire (le cadre et la condition partent, le texte reste).
//
// Résolution : js/reader-mode.js la fait une fois, après le déroulé des zones répétées et avant celle des bulles : le HTML rendu à la Lecture, au
// PDF, au Word, à l'e-mail et aux en-têtes/pieds est donc déjà sans bloc. Condition remplie : le cadre disparaît, son contenu reste. Sinon : le bloc
// et son contenu disparaissent, sans ligne vide - ou, quand le bloc a un sinon, ce texte s'écrit à sa place. Pas de condition : toujours affiché. Condition illisible :
// masqué, comme une bulle.
//
// Le sinon (suite de celui de la valeur conditionnelle, js/conditional-value.js) est un second texte, écrit à la place du bloc quand sa condition n'est pas
// remplie : l'attribut `otherwise` du nœud, `data-otherwise` dans le HTML, réglé par la ligne « Sinon afficher » de la fenêtre de condition
// (js/variable-condition.js, un champ de plusieurs lignes). Du texte brut - jamais lu comme du HTML - dont chaque ligne non vide fait un paragraphe, sans les
// espaces de ses deux bouts ; rien, ou que des espaces et des lignes vides, n'est pas un sinon (le bloc disparaît comme avant). Les deux fonctions qui le
// lisent (`otherwiseText`, `otherwiseLines`) servent aussi à la valeur conditionnelle.
const ConditionalText = (function () {
  const TYPE = 'conditionalText';
  const SELECTOR = 'div.conditional-text';
  // Les caractères qu'un sinon de bloc peut porter dans sa fenêtre (quelques lignes : au-delà, c'est un second bloc, aux conditions opposées).
  const OTHERWISE_MAX = 1000;

  // Le sinon d'un bloc ou d'une valeur tel qu'il est enregistré (attribut `data-otherwise`, ou celui du nœud) : le texte lui-même, ou null - rien, ou que des
  // espaces et des retours à la ligne, n'est pas un sinon.
  function otherwiseText(raw) {
    return typeof raw === 'string' && /\S/.test(raw) ? raw : null;
  }
  // Ses lignes non vides, sans les espaces de leurs deux bouts : un paragraphe chacune à la place d'un bloc, et ce que l'aperçu et l'info-bulle en citent.
  function otherwiseLines(raw) {
    const text = otherwiseText(raw);
    return text ? text.split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean) : [];
  }

  // Défait chaque bloc de `root` dont la condition est remplie (le cadre disparaît, son contenu reste), retire les autres - ou les remplace par leur sinon, un
  // paragraphe par ligne. Un bloc extérieur retiré emporte les blocs qu'il contient (son sinon seul s'écrit), un bloc extérieur défait laisse les siens à leur
  // verdict.
  function resolve(root, tableId, record) {
    return ConditionRules.resolveElements(root, SELECTOR, tableId, record, true, (block, holds) => {
      if (holds) { block.replaceWith(...Array.from(block.childNodes)); return; }
      const lines = otherwiseLines(block.getAttribute('data-otherwise'));
      if (!lines.length) { LoopRules.removeAndPrune(block); return; }
      block.replaceWith(...lines.map(line => {
        const paragraph = block.ownerDocument.createElement('p');
        paragraph.textContent = line;
        return paragraph;
      }));
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

  // Le bloc vide dans le paragraphe de `$pos` : à sa place s'il n'en reste rien, avant lui si la requête était à son début, après si elle était à sa
  // fin, sinon le paragraphe est coupé en deux et le bloc se pose entre les deux moitiés. Rend la position du bloc, ou -1 quand son conteneur n'en veut
  // pas à cet endroit.
  function insertAroundParagraph(tr, $pos, pos, type, block) {
    const depth = $pos.depth;
    const container = $pos.node(depth - 1);
    const index = $pos.index(depth - 1);
    const offset = $pos.parentOffset;
    const size = $pos.parent.content.size;
    let at = -1;
    if (!size) {
      if (!container.canReplaceWith(index, index + 1, type)) return -1;
      at = $pos.before(depth);
      tr.replaceWith(at, $pos.after(depth), block);
    } else if (offset === 0 && container.canReplaceWith(index, index, type)) {
      at = $pos.before(depth);
      tr.insert(at, block);
    } else if (offset === size && container.canReplaceWith(index + 1, index + 1, type)) {
      at = $pos.after(depth);
      tr.insert(at, block);
    } else if (offset > 0 && offset < size && container.canReplaceWith(index + 1, index + 1, type)) {
      tr.split(pos);
      at = pos + 1;
      tr.insert(at, block);
    }
    return at;
  }

  // Un bloc qui ne peut pas aller dans le paragraphe (premier enfant d'un élément de liste) se pose après lui, puis après chaque bloc qui le contient,
  // en remontant. Rend la position du bloc, ou -1.
  function insertAfterAncestor(tr, $pos, type, block) {
    let at = -1;
    for (let d = $pos.depth; d >= 1 && at < 0; d--) {
      if ($pos.node(d - 1).canReplaceWith($pos.index(d - 1) + 1, $pos.index(d - 1) + 1, type)) { at = $pos.after(d); tr.insert(at, block); }
    }
    return at;
  }

  // Un bloc vide à la place de « #requête » : dans son paragraphe (insertAroundParagraph), sinon après lui ou après l'un des blocs qui le contiennent.
  // Rend la position du bloc, ou -1.
  function insertEmptyInTransaction(tr, pos) {
    const { schema } = tr.doc.type;
    const type = schema.nodes[TYPE];
    if (!type) return -1;
    const block = type.create(null, schema.nodes.paragraph.create());
    const $pos = tr.doc.resolve(pos);
    if (!$pos.parent.isTextblock || $pos.depth <= 0) return -1;
    const at = insertAroundParagraph(tr, $pos, pos, type, block);
    return at >= 0 ? at : insertAfterAncestor(tr, $pos, type, block);
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

  // Un bloc qui finit son conteneur (case de tableau, colonne, élément de liste, citation, bloc emboîté) n'a rien derrière lui : aucune place où poser le curseur - la
  // flèche passe à la case voisine, un clic dessous ou à côté retombe dans le texte du bloc, et seule Entrée deux fois, dans un bloc qui a du texte, en sort. Au bas du
  // document, c'est le paragraphe de fin de TipTap qui sert. Un clic dans la place libre du conteneur - sous le cadre du bloc, ou à sa droite, à sa hauteur : le cadre n'a que
  // la largeur de son texte - pose donc un paragraphe vide derrière lui, le curseur dedans, pour écrire la suite dans le même conteneur comme derrière une variable ; une seule
  // étape d'annulation. `container` est le nœud cliqué et `containerPos` sa position (`handleClickOn` de js/editor-nodes.js:createConditionalTextNode). Faux, sans rien
  // changer, quand le clic tombe ailleurs : dans le bloc, sur la poignée de largeur d'une colonne, au-dessus du cadre, ou quand quelque chose suit déjà le bloc.
  function addParagraphAfter(view, container, containerPos, event) {
    const block = container.lastChild;
    const { schema } = view.state;
    if (!view.editable || !block || block.type.name !== TYPE || event.altKey || event.ctrlKey || event.metaKey) return false;
    if (!container.canReplaceWith(container.childCount, container.childCount, schema.nodes.paragraph)) return false;
    // Le clic est tombé sur le conteneur lui-même, pas sur l'un de ses enfants (le cadre du bloc, la poignée de largeur d'une colonne de tableau).
    if (event.target !== view.domAtPos(containerPos + 1).node) return false;
    const at = containerPos + container.nodeSize - 1;
    const frame = view.nodeDOM(at - block.nodeSize);
    if (!(frame instanceof Element)) return false;
    const box = frame.getBoundingClientRect();
    if (!(event.clientY > box.bottom || (event.clientX > box.right && event.clientY >= box.top))) return false;
    const TextSelection = EditorCore.getTextSelectionClass();
    const tr = view.state.tr.insert(at, schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, at + 1));
    view.dispatch(tr.scrollIntoView());
    // Suivi des modifications allumé, la bibliothèque rapporte la sélection au bout du texte inséré, hors de la case : le curseur est reposé dans le paragraphe neuf.
    const inside = TextSelection.create(view.state.doc, at + 1);
    if (view.state.doc.resolve(at + 1).parent.isTextblock && !view.state.selection.eq(inside)) view.dispatch(view.state.tr.setSelection(inside));
    view.focus();
    return true;
  }

  // `takePending` sert aussi à la valeur conditionnelle (js/conditional-value.js) : le texte retenu par le bouton « Insérer une variable » peut être
  // entouré d'un bloc ou, dans un seul paragraphe, d'une valeur.
  return { OTHERWISE_MAX, otherwiseText, otherwiseLines, resolve, startFromSelection, hasPending, cancelPending, takePending, insertFromPanel, unwrap, addParagraphAfter };
})();
