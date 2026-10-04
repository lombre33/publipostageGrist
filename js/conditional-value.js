// Valeur conditionnelle (menu des variables, onglet Chips ; demande d'Antoine du 02/10, « une valeur - un ou plusieurs mots, un nombre etc. - qui s'affiche de manière conditionnelle »,
// choix « Dans la phrase ») : le pendant EN LIGNE du bloc de texte conditionnel (js/conditional-text.js). Un nœud en ligne qui contient du texte - mis en forme, avec des bulles, des
// retours à la ligne - et qui n'apparaît en lecture et à l'export que si sa condition est remplie. Petite par défaut, son cadre grandit avec ce qu'on y met. Le nœud de l'éditeur est dans
// js/editor-nodes.js (createConditionalValueNode), la barre flottante dans js/floating-toolbars.js, la fenêtre de condition (la même que celle d'une bulle) dans js/variable-condition.js.
// Ce fichier porte les bouts qui restent : la pose de la valeur dans l'éditeur (à la place de « #requête », ou autour du texte sélectionné), sa résolution au rendu et son défaire
// (« Défaire la valeur » de la fenêtre de condition : le cadre et la condition partent, le texte reste).
//
// Résolution : js/reader-mode.js la fait UNE fois, juste après les blocs de texte conditionnels et avant les cases conditionnelles et les bulles - le HTML qu'elle rend à la Lecture, au
// PDF, au Word, à l'e-mail, à l'Excel et aux en-têtes/pieds est donc déjà sans valeur conditionnelle. Condition remplie : le cadre disparaît et son contenu reste, au fil de la phrase, sans rien
// ajouter autour. Sinon : la valeur et tout ce qu'elle contient disparaissent, le texte autour reste (comme une bulle masquée : un paragraphe qui n'en contenait qu'une garde sa ligne).
// Pas de condition : toujours affichée. Condition illisible : masquée, comme une bulle (js/reader-mode.js).
const ConditionalValue = (function () {
  const TYPE = 'conditionalValue';
  const SELECTOR = 'span.conditional-value';

  // === Rendu ===
  // Défait chaque valeur de `root` dont la condition est remplie, retire les autres. Les conditions se lisent toutes d'abord, en parallèle ; le HTML se transforme ensuite, dans l'ordre du
  // document : une valeur extérieure retirée emporte celles qu'elle contient (elles ne sont plus dans `root`), une valeur extérieure défaite laisse les siennes à leur verdict.
  async function resolve(root, tableId, record) {
    if (!root) return;
    const spans = Array.from(root.querySelectorAll(SELECTOR));
    if (!spans.length) return;
    const verdicts = await Promise.all(spans.map(span => ConditionRules.elementHolds(span, tableId, record, true)));
    spans.forEach((span, i) => {
      if (!root.contains(span)) return;
      if (verdicts[i]) span.replaceWith(...Array.from(span.childNodes));
      else span.remove();
    });
  }

  // === Éditeur ===
  // Choix de « Valeur conditionnelle » dans la liste « # » : `range` est « #requête » (js/variables.js:command). Avec du texte retenu par ConditionalText.startFromSelection (le bouton
  // « Insérer une variable » sur du texte sélectionné) et d'un seul paragraphe, la valeur l'entoure et la sélection reprend son texte ; sinon une valeur vide se pose et le curseur s'y
  // met, prêt à taper. Dans les deux cas, « #requête » disparaît. Faux, sans rien changer, si le curseur est là où une valeur n'a pas sa place (un bloc de code).
  function insertFromPanel(editor, range) {
    const { state, view } = editor;
    const TextSelection = EditorCore.getTextSelectionClass();
    const type = state.schema.nodes[TYPE];
    if (!type) return false;
    const wrap = ConditionalText.takePending();
    const tr = state.tr.delete(range.from, range.to);
    let selection = null;
    if (wrap) {
      const from = tr.mapping.map(wrap.from, 1);
      const to = tr.mapping.map(wrap.to, -1);
      if (from < to && to <= tr.doc.content.size) {
        const $from = tr.doc.resolve(from);
        const content = tr.doc.slice(from, to).content;
        if ($from.sameParent(tr.doc.resolve(to)) && $from.parent.isTextblock && $from.parent.canReplaceWith($from.index(), tr.doc.resolve(to).index(), type) && type.validContent(content)) {
          tr.replaceWith(from, to, type.create(null, content));
          // Le texte sélectionné reste sélectionné, une marque d'ouverture plus loin : la valeur s'ouvre juste avant lui.
          selection = TextSelection.create(tr.doc, from + 1, from + 1 + content.size);
        }
      }
    }
    if (!selection) {
      // Rien à entourer : la valeur vide se pose à la place de « #requête » - ou, quand un texte avait été sélectionné (sur plusieurs paragraphes, une valeur ne les contient pas), au début de
      // cette sélection : la requête, elle, est tout au début du paragraphe, loin de l'endroit où la personne avait choisi.
      const at = wrap ? tr.mapping.map(wrap.from, 1) : tr.mapping.map(range.from, -1);
      const $at = tr.doc.resolve(at);
      if (!$at.parent.inlineContent || $at.parent.type.spec.code || !$at.parent.canReplaceWith($at.index(), $at.index(), type)) {
        console.warn('[ConditionalValue] aucun endroit où poser une valeur conditionnelle ici.');
        return false;
      }
      tr.insert(at, type.create());
      // Curseur dans la valeur : juste après son ouverture.
      selection = TextSelection.create(tr.doc, at + 1);
    }
    view.dispatch(tr.setSelection(selection).scrollIntoView());
    // Suivi des modifications : la bibliothèque réécrit la transaction en suggestion et pose le curseur DERRIÈRE le contenu inséré, hors de la valeur - la frappe suivante n'y serait pas.
    // La valeur est alors juste avant le curseur : il y retourne (son texte sélectionné, quand elle entoure un texte).
    const placed = view.state.selection;
    const inserted = placed.empty ? placed.$from.nodeBefore : null;
    if (inserted && inserted.type === type && placed.$from.parent.type !== type) {
      const start = placed.from - inserted.nodeSize + 1;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start, selection.empty ? start : start + inserted.content.size)));
    }
    view.focus();
    // Une valeur VIDE n'a aucune largeur : pour le curseur du navigateur, « dedans » et « juste derrière » sont la même place, ProseMirror le laisse donc où il est - et la frappe suivante tombait
    // derrière la valeur (derrière un « Tout refuser » qui la laissait vide, surtout). Le curseur se pose dans la valeur, à la main.
    const now = view.state.selection;
    if (now.empty && now.$from.parent.type === type && now.$from.parent.content.size === 0) {
      const dom = view.nodeDOM(now.$from.before());
      const domSelection = view.root.getSelection && view.root.getSelection();
      if (dom && domSelection) domSelection.collapse(dom, 0);
    }
    // Un clic sur une ligne de la liste referme les barres flottantes à la fin de son « mousedown » (js/editor-core.js : un clic hors de l'éditeur et de toute barre) : la barre de la valeur,
    // que ce curseur vient d'ouvrir, se refermerait aussitôt. Une transaction sans effet la rouvre juste après, quand le clic est fini (la barre se règle sur le curseur du moment).
    setTimeout(() => { if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr); }, 0);
    return true;
  }

  // « Défaire la valeur » (fenêtre de condition, js/variable-condition.js) : la valeur qui commence à `pos` disparaît avec sa condition, son texte reste à sa place. Une seule transaction :
  // un Ctrl+Z rend la valeur et sa condition. La valeur est REMPLACÉE par son contenu, pas « levée » : même raison que pour un bloc (ConditionalText.unwrap), le suivi des modifications rend
  // alors « Tout accepter » exactement le document sans la valeur et « Tout refuser » celui d'avant. Le curseur se pose au début du texte libéré. Faux, sans rien changer, si `pos` ne
  // porte plus une valeur.
  function unwrap(editor, pos) {
    const { state, view } = editor;
    const node = state.doc.nodeAt(pos);
    if (!node || node.type.name !== TYPE) return false;
    const tr = state.tr.replaceWith(pos, pos + node.nodeSize, node.content);
    tr.setSelection(EditorCore.getTextSelectionClass().near(tr.doc.resolve(pos), 1));
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  return { TYPE, SELECTOR, resolve, insertFromPanel, unwrap };
})();
