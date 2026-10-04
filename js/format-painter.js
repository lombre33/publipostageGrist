// Pinceau de mise en forme. Un clic sur le bouton (#v2-btn-format-painter) copie la mise en forme du texte où l'on se trouve ; la sélection qu'on
// fait ensuite la reçoit, puis le pinceau se range. Un double-clic le garde armé pour peindre plusieurs endroits, Échap ou un nouveau clic l'arrête.
// Au clavier (js/shortcuts.js) : « Reproduire la mise en forme » (Alt+Maj+C, le même geste que le bouton) puis « Appliquer la mise en forme »
// (Alt+Maj+V) sur la sélection voulue, faite au clavier ou à la souris.
//
// Copié depuis la source (le premier caractère de la sélection, ou le curseur) :
//  - la mise en forme du caractère : gras, italique, souligné, barré, police, taille, couleur, surlignage. Elle remplace celle du texte peint
//    (peindre un texte ordinaire efface celle de la cible, comme dans Word). Un lien, un commentaire, une marque du suivi des modifications sont du
//    contenu, pas de la mise en forme : jamais touchés ;
//  - celle du paragraphe (alignement, niveau de titre) quand la source est un curseur ou un paragraphe entier, comme le « ¶ » de Word : une sélection
//    partielle ne copie que le caractère. Elle n'est posée que sur les paragraphes peints en entier (triple-clic, ou sélection qui les couvre) :
//    peindre un mot ne recentre pas son paragraphe. Les puces, les tableaux et les images ne sont pas de la mise en forme de texte ; un paragraphe de
//    légende garde son type.
// Une application est une seule transaction : un seul Ctrl+Z la défait.
const FormatPainter = (function () {
  const BUTTON_ID = 'v2-btn-format-painter';
  const ARMED_CLASS = 'pp-format-painting'; // posée sur <html> tant que le pinceau attend : css/format-painter.css y met le curseur
  // Les marques de la mise en forme d'un caractère : `textStyle` porte la police, la taille, la couleur et le surlignage (js/editor-nodes.js).
  const FORMAT_MARKS = ['bold', 'italic', 'underline', 'strike', 'textStyle'];
  const PARAGRAPH_TYPES = ['paragraph', 'heading'];
  const MULTI_CLICK_MS = 700; // un clic qui suit de moins que cela le double-clic qui vient de peindre un mot en est le troisième : le triple-clic

  let editor = null;
  let button = null;
  let wired = false;
  let snapshot = null; // { marks: [Mark], block: { type, level, align } | null } : la dernière mise en forme copiée, gardée tant qu'on n'en copie pas une autre
  let armed = false; // le pinceau attend la prochaine sélection
  let sticky = false; // armé par un double-clic : il le reste après chaque application
  let pointerInEditor = false; // l'appui de souris en cours a commencé dans le texte, pinceau armé
  let settleTimer = null;
  let lastMousePaint = null; // { at, from, to } : la dernière application à la souris, pour le triple-clic qui la prolonge

  // Le pinceau agit-il ? Faux quand son bouton est grisé (e-mail, macro-modèle, Lecture, droits) : la barre le dit par `v2-hf-locked` ou
  // `pp-access-locked`, jamais en le retirant.
  function isUsable() {
    return !!editor && !!button && !button.disabled && !button.closest('[hidden], .v2-hf-locked, .pp-access-locked');
  }

  // Le bloc de texte est-il peint en entier par la sélection [from, to] ? Un bloc vide l'est quand la sélection le dépasse des deux côtés. Un
  // triple-clic qui déborde au tout début du bloc suivant (Chrome) ne le couvre pas.
  function coversBlock(from, to, pos, node) {
    const start = pos + 1;
    const end = pos + node.nodeSize - 1;
    if (end > start) return from <= start && to >= end;
    return from < start && to > end;
  }

  // Les marques de mise en forme d'une liste de marques ; un `textStyle` sans aucun réglage n'en est pas une.
  function formatMarksOf(marks) {
    return (marks || []).filter(mark => FORMAT_MARKS.indexOf(mark.type.name) !== -1
      && !(mark.type.name === 'textStyle' && Object.keys(mark.attrs).every(key => mark.attrs[key] == null || mark.attrs[key] === '')));
  }

  // Ce que la sélection donne à copier : les marques de son premier caractère (ou celles que la frappe prendrait, au curseur), le paragraphe de la
  // source quand elle est un curseur ou couvre ce paragraphe.
  function capture(state) {
    const { selection, doc } = state;
    let marks = null;
    let block = null;
    let whole = false;
    if (selection.empty) {
      marks = state.storedMarks || selection.$from.marks();
      if (selection.$from.parent.isTextblock) { block = selection.$from.parent; whole = true; }
    } else {
      selection.ranges.some(range => {
        const from = range.$from.pos;
        const to = range.$to.pos;
        doc.nodesBetween(from, to, (node, pos) => {
          if (!block && node.isTextblock) { block = node; whole = coversBlock(from, to, pos, node); }
          if (!marks && node.isInline) marks = node.marks;
          return !(block && marks);
        });
        return !!(block && marks);
      });
    }
    const paragraph = block && whole && PARAGRAPH_TYPES.indexOf(block.type.name) !== -1
      ? { type: block.type.name, level: block.attrs.level || null, align: block.attrs.textAlign || null }
      : null;
    return { marks: formatMarksOf(marks), block: paragraph };
  }

  // La transaction qui pose `snap` sur la sélection : les marques de caractère d'abord (celles de la cible retirées, celles de la source posées),
  // puis le paragraphe de chaque bloc de texte peint en entier. { tr, reachable } : `reachable` dit s'il y avait du contenu en ligne (du texte, une
  // bulle) à mettre en forme.
  function paintTransaction(state, snap, onSelection) {
    const { doc, schema } = state;
    const selection = onSelection || state.selection;
    const tr = state.tr;
    const ranges = selection.ranges.map(range => [range.$from.pos, range.$to.pos]).filter(([from, to]) => to > from);
    let reachable = false;
    const blocks = [];
    ranges.forEach(([from, to]) => {
      doc.nodesBetween(from, to, (node, pos) => {
        if (node.isInline) reachable = true;
        else if (snap.block && node.isTextblock && PARAGRAPH_TYPES.indexOf(node.type.name) !== -1 && coversBlock(from, to, pos, node)) blocks.push({ node, pos });
        return true;
      });
    });
    ranges.forEach(([from, to]) => {
      FORMAT_MARKS.forEach(name => { if (schema.marks[name]) tr.removeMark(from, to, schema.marks[name]); });
      snap.marks.forEach(mark => tr.addMark(from, to, mark));
    });
    blocks.forEach(({ node, pos }) => {
      const want = snap.block;
      const attrs = Object.assign({}, node.attrs);
      attrs.textAlign = want.align; // null = pas d'alignement posé : une source à gauche remet à gauche un paragraphe centré
      let type = node.type;
      const wantedType = schema.nodes[want.type];
      const $pos = tr.doc.resolve(pos);
      const changesType = wantedType && (wantedType !== type || (want.type === 'heading' && node.attrs.level !== want.level));
      // Un paragraphe de légende reste une légende ; un titre n'entre pas là où le schéma ne l'accepte pas (le premier bloc d'une puce).
      if (changesType && !node.attrs.caption && $pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, wantedType)) {
        type = wantedType;
        if (want.type === 'heading') attrs.level = want.level;
      }
      if (type !== node.type || JSON.stringify(attrs) !== JSON.stringify(node.attrs)) tr.setNodeMarkup(pos, type, attrs);
    });
    return { tr, reachable };
  }

  function refresh() {
    document.documentElement.classList.toggle(ARMED_CLASS, armed);
    if (!button) return;
    button.classList.toggle('is-active', armed);
    button.setAttribute('aria-pressed', armed ? 'true' : 'false');
    if (armed && sticky) button.setAttribute('data-sticky', 'true'); else button.removeAttribute('data-sticky');
  }
  function arm(keepArmed) { armed = true; sticky = !!keepArmed; refresh(); }
  function disarm() {
    armed = false;
    sticky = false;
    pointerInEditor = false;
    clearTimeout(settleTimer);
    settleTimer = null;
    refresh();
  }

  // Copie la mise en forme de l'endroit où l'on est. Faux quand le pinceau est grisé ou l'éditeur absent.
  function copy() {
    if (!isUsable()) return false;
    snapshot = capture(editor.state);
    editor.chain().focus().run(); // le curseur et la sélection source restent là où ils étaient
    return true;
  }

  // Pose la mise en forme copiée sur la sélection. Vrai quand il y avait du texte à mettre en forme (même s'il l'était déjà, rien ne change alors) ;
  // faux sinon - sélection vide ou sans texte (une image), rien de copié, pinceau grisé : l'appelant garde alors le pinceau armé. Un pinceau armé
  // d'un clic se range après une application ; armé d'un double-clic, il reste.
  function apply(releasedCells) {
    if (!snapshot || !isUsable()) return false;
    const state = editor.state;
    // La sélection de cases relevée au relâchement de la souris, si le document n'a pas changé depuis ; sinon la sélection du moment.
    const cells = releasedCells && releasedCells.$anchorCell.doc === state.doc ? releasedCells : null;
    const { tr, reachable } = paintTransaction(state, snapshot, cells);
    if (!reachable) return false;
    if (cells && cells !== state.selection) tr.setSelection(cells.map(tr.doc, tr.mapping)); // ProseMirror l'avait reconvertie en texte : les cases restent sélectionnées
    if (tr.docChanged || tr.selectionSet) editor.view.dispatch(tr);
    editor.view.focus();
    if (armed && !sticky) disarm();
    return true;
  }

  // Le clic du bouton : copie et arme, ou, déjà armé, arrête. Le double-clic (au-dessous) garde le pinceau armé. Un clic « de clavier » (Entrée,
  // Espace, la touche du pinceau) a un `detail` de 0 : il bascule comme un clic.
  function onButtonClick(event) {
    if (event.detail >= 2) return; // le second clic d'un double-clic : le `dblclick` qui suit s'en charge
    if (armed) disarm();
    else if (copy()) arm(false);
  }
  function onButtonDoubleClick() {
    if (copy()) arm(true);
  }

  // La souris : seul un appui commencé dans le texte, pinceau armé, compte (le clic sur le bouton lui-même ne doit rien peindre). À son relâchement,
  // la sélection est prête (un glissé, un double-clic sur un mot, un triple-clic sur un paragraphe, Maj+clic) : le pinceau la peint. Un simple clic,
  // sans sélection, ne fait rien et laisse le pinceau armé.
  function onMouseDown(event) {
    const inText = !!editor && editor.view.dom.contains(event.target);
    pointerInEditor = inText && (armed || continuesMousePaint(event));
  }
  function onMouseUp() {
    if (!pointerInEditor) return;
    pointerInEditor = false;
    clearTimeout(settleTimer);
    // Un glissé sur des cases d'un tableau : la sélection de cases n'existe que jusqu'ici, ProseMirror la reconvertit en texte (celui où le
    // navigateur a fini son glissé) juste après le relâchement, tantôt avant tantôt après le tour qui suit : on la relève maintenant (ce relâchement
    // passe ici avant le sien, en capture).
    const cells = editor.state.selection.$anchorCell ? editor.state.selection : null;
    // Après le tour de ProseMirror : sa sélection suit celle du navigateur à ce relâchement.
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (apply(cells)) {
        const { from, to } = editor.state.selection;
        lastMousePaint = { at: Date.now(), from, to };
      }
    }, 0);
  }
  // Un triple-clic commence par un double-clic, qui peint déjà le mot (et range un pinceau d'un clic) : le troisième clic, dans la foulée et sur ce
  // même mot, peint le paragraphe entier.
  function continuesMousePaint(event) {
    if (!lastMousePaint || event.detail < 3 || Date.now() - lastMousePaint.at > MULTI_CLICK_MS) return false;
    const at = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    return !!at && at.pos >= lastMousePaint.from && at.pos <= lastMousePaint.to;
  }
  function onKeyDown(event) {
    if (armed && event.key === 'Escape') disarm();
  }

  // Un pinceau armé dont le bouton vient d'être grisé (Lecture, droits, e-mail, macro-modèle : une classe posée sur le bouton, par js/main.js ou
  // js/main-toolbar.js) s'arrête.
  function stopWhenGreyed() {
    if (armed && !isUsable()) disarm();
  }

  function wire(ed) {
    editor = ed;
    button = document.getElementById(BUTTON_ID);
    if (wired || !button) return;
    wired = true;
    button.addEventListener('click', onButtonClick);
    button.addEventListener('dblclick', onButtonDoubleClick);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('keydown', onKeyDown);
    new MutationObserver(stopWhenGreyed).observe(button, { attributes: true, attributeFilter: ['class', 'disabled', 'hidden'] });
    refresh();
  }

  return {
    wire, copy, apply, arm, disarm,
    isArmed: () => armed,
    isSticky: () => armed && sticky,
    hasCopy: () => !!snapshot,
    // Ce qui a été copié, en clair (les tests le lisent) : les marques de caractère et le paragraphe.
    peek: () => (snapshot ? { marks: snapshot.marks.map(mark => ({ type: mark.type.name, attrs: Object.assign({}, mark.attrs) })), block: snapshot.block ? Object.assign({}, snapshot.block) : null } : null),
  };
})();
