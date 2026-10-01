// Case conditionnelle (menu des variables, onglet Chips ; demande d'Antoine du 01/10, « une case cochée ou décochée en fonction d'une condition basée sur une colonne ») : une puce
// en ligne qui se lit comme une case cochée quand sa condition est remplie, décochée sinon. Le nœud de l'éditeur est dans js/editor-nodes.js (createConditionalCheckboxNode), la
// barre flottante dans js/floating-toolbars.js, la fenêtre de condition (la même que celle d'une bulle ou d'un bloc de texte conditionnel) dans js/variable-condition.js.
// Ce fichier porte les bouts qui restent : le style d'une case neuve, sa pose dans l'éditeur depuis la liste « # » et sa résolution au rendu.
//
// Résolution : js/reader-mode.js la fait UNE fois, juste après les blocs de texte conditionnels et avant les bulles - le HTML qu'elle rend à la Lecture, au PDF, au Word, à l'Excel,
// à l'e-mail et aux en-têtes/pieds contient donc déjà la case dessinée (ReaderMode.checkboxNode, la même que celle d'une variable Oui / Non), que tous ces exports savent lire.
// Sans condition : décochée (rien à cocher). Condition illisible : décochée, comme une bulle masquée (js/reader-mode.js).
const ConditionalCheckbox = (function () {
  const TYPE = 'conditionalCheckbox';
  const SELECTOR = 'span.conditional-checkbox';
  // Une case neuve est « accent, texte normal ». Les deux styles « accent » dessinent la même case : le texte qui suit n'est jamais barré, le barré n'existe que dans la liste à cases (Antoine, 01/10).
  const DEFAULT_STYLE = 'accentPlain';
  function styleOf(value) { return VariableFormat.isCheckboxStyle(value) ? value : DEFAULT_STYLE; }

  // === Rendu ===
  // La case est cochée si la condition lue dans son data-condition est remplie. `binding` : la ligne du tour d'une zone répétée qui contient la case (js/loop-rules.js:bindingOf) - une
  // règle sur une colonne de la table de la boucle lit alors cette ligne.
  async function holds(chip, tableId, record) {
    const raw = chip.getAttribute('data-condition');
    if (!raw) return false;
    let condition = null;
    try { condition = JSON.parse(raw); } catch (e) { console.error('[ConditionalCheckbox] condition de case illisible', e); return false; }
    if (!ConditionRules.normalizeCondition(condition)) return false;
    const binding = LoopRules.bindingOf(chip);
    try { return await ConditionRules.conditionHolds(condition, tableId, record, binding ? { loop: binding } : undefined); }
    catch (e) { console.error('[ConditionalCheckbox] échec de l\'évaluation de la condition d\'une case', e); return false; }
  }

  // Remplace chaque case conditionnelle de `root` par sa case dessinée. Les conditions se lisent toutes d'abord, en parallèle ; le HTML se transforme ensuite.
  async function resolve(root, tableId, record) {
    if (!root) return;
    const chips = Array.from(root.querySelectorAll(SELECTOR));
    if (!chips.length) return;
    const verdicts = await Promise.all(chips.map(chip => holds(chip, tableId, record)));
    chips.forEach((chip, i) => {
      const box = ReaderMode.checkboxNode(verdicts[i], styleOf(chip.getAttribute('data-checkbox-style')));
      // Repère de position posé par js/comments.js:buildReaderHtml (commentaires en mode Lecture) : reporté sur la case qui remplace la puce.
      if (chip.hasAttribute('data-pp-atom')) box.setAttribute('data-pp-atom', chip.getAttribute('data-pp-atom'));
      chip.replaceWith(box);
    });
  }

  // === Éditeur ===
  // Choix de « Case conditionnelle » dans la liste « # » : `range` est « #requête » (js/variables.js:command). La puce prend sa place et reste sélectionnée : sa barre flottante s'ouvre,
  // d'où se règle la condition. Faux, sans rien changer, si le curseur est là où une puce en ligne n'a pas sa place (un bloc de code).
  function insertFromPanel(editor, range) {
    const done = editor.chain().focus().insertContentAt(range, { type: TYPE, attrs: { style: DEFAULT_STYLE } }).run();
    if (!done) return false;
    const from = range.from;
    const select = () => {
      if (editor.isDestroyed) return;
      const node = editor.state.doc.nodeAt(from);
      if (node && node.type.name === TYPE) editor.commands.setNodeSelection(from);
    };
    select();
    // Un clic sur une ligne de la liste referme les barres flottantes à la fin de son « mousedown » (js/editor-core.js : un clic hors de l'éditeur et de toute barre) : la barre que
    // cette sélection vient d'ouvrir se refermerait aussitôt. La sélection est donc reposée juste après, quand le clic est fini.
    setTimeout(select, 0);
    return true;
  }

  return { TYPE, SELECTOR, DEFAULT_STYLE, styleOf, resolve, insertFromPanel };
})();
