// L'ANIMATION d'un élément du texte d'une diapositive (demande du 13/11 : « chaque élément de la page, hors éléments de fond, doit pouvoir avoir une animation », et « un paragraphe à la fois » de
// PowerPoint). Avant, seuls les cadres, formes et lignes (js/free-frame.js) s'animaient ; ici l'animation devient un réglage de n'importe quel élément du texte, le MÊME `data-ff-anim` que celui d'un cadre
// (js/frame-anim.js : le réglage, ses pas, ses mouvements) :
//  - Les ÉLÉMENTS : un paragraphe, un titre, un point de liste ou une case à cocher (avec ses sous-points : ils arrivent avec lui, comme « par paragraphe de premier niveau » de PowerPoint), une image,
//    un tableau. Un paragraphe d'un point de liste, ou d'une case de tableau, n'est pas un élément à lui : c'est le point, ou le tableau, qui s'anime. Une image « derrière le texte » est un décor, elle ne
//    s'anime pas ; un cadre, une forme ou une ligne gardent leur bouton « Animation… » (et se règlent ici aussi quand ils sont sélectionnés).
//  - Le RÉGLAGE : un attribut `anim` de ces nœuds, écrit `data-ff-anim` sur l'élément. Vide tant que personne ne l'a posé : ni HTML ni rendu qui change. Entrée à la fin d'un élément animé ouvre un
//    élément qui ne l'est pas (le réglage est un geste, il ne se propage pas à tout ce qu'on écrit ensuite). Rien ne bouge dans l'éditeur, la Lecture, le PDF, le Word ni l'impression.
//  - L'ÉLÉMENT visé (`unitAt`) : celui du curseur - le point de liste, le titre ou le paragraphe où il est, le tableau dont il est dans une case, l'image ou le cadre sélectionné. La fenêtre
//    « Animation… » (extensions/diapositives/frame-anim-ui.js) le règle ; `patch` l'écrit en UN pas d'historique.
//  - Le diaporama (extensions/diapositives/slide-player.js) joue l'élément comme un cadre : `FrameAnim.framesOf` cherche tout `data-ff-anim` de la diapositive.
const BlockAnim = (function () {
  const TYPES = ['paragraph', 'heading', 'listItem', 'taskItem', 'editorImage', 'table'];
  const ITEMS = ['listItem', 'taskItem'];
  const CELLS = ['tableCell', 'tableHeader'];
  const IMAGE = 'editorImage';
  // Un cadre, une forme ou une ligne (js/free-frame.js) : leur réglage est celui de leur nœud, avec ses propres gardes.
  const isFrame = node => typeof FreeFrame !== 'undefined' && (node.type.name === FreeFrame.NODE || node.type.name === FreeFrame.LINE_NODE);

  function createExtension(Extension) {
    return Extension.create({
      name: 'blockAnimation',
      addGlobalAttributes() {
        return [{
          types: TYPES,
          attributes: {
            anim: {
              default: '',
              keepOnSplit: false,
              parseHTML: el => FrameAnim.text(el.getAttribute(FrameAnim.ATTR)),
              renderHTML: attrs => (attrs.anim ? { [FrameAnim.ATTR]: attrs.anim } : {}),
            },
          },
        }];
      },
    });
  }

  // Le texte du réglage d'un nœud (un cadre, une forme, une ligne ou un élément du texte) : '' sans animation.
  function textOf(node) {
    if (!node) return '';
    if (isFrame(node)) return FrameAnim.text(FreeFrame.normalized(node.attrs).anim);
    return FrameAnim.text(node.attrs.anim);
  }
  // Un décor ne s'anime pas : une image derrière le texte.
  const isDecor = node => node.type.name === IMAGE && node.attrs.layer === 'behind';

  // L'élément qu'une sélection vise : { pos, node } ou null. Un nœud sélectionné (un cadre, une image) est lui-même visé ; sinon l'élément du curseur, du plus profond au plus large :
  // un tableau l'emporte sur tout ce qu'il contient, un point de liste sur son paragraphe, puis le titre ou le paragraphe. Hors de tout élément (une ligne vide de fin de page...), null.
  function unitAt(state) {
    const { selection } = state;
    if (selection.node) {
      const node = selection.node;
      if (isFrame(node)) return { pos: selection.from, node };
      return TYPES.includes(node.type.name) && !isDecor(node) ? { pos: selection.from, node } : null;
    }
    const $from = selection.$from;
    let table = null;
    let item = null;
    let block = null;
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      const name = node.type.name;
      if (name === 'table') table = { pos: $from.before(depth), node };
      else if (!item && ITEMS.includes(name)) item = { pos: $from.before(depth), node };
      else if (!block && (name === 'paragraph' || name === 'heading')) block = { pos: $from.before(depth), node };
    }
    // Le tableau l'emporte, puis le point de liste (c'est lui qui s'anime, non son paragraphe), puis le titre ou le paragraphe.
    return table || item || block;
  }

  // Pose le réglage `text` ('' : aucune animation) sur le nœud à `pos` : UN pas d'historique ; faux quand rien ne change ou qu'il n'y a pas d'élément. Un cadre passe par son propre nœud (js/free-frame.js).
  function patch(ed, pos, text, reselect) {
    const node = ed.state.doc.nodeAt(pos);
    if (!node) return false;
    if (isFrame(node)) return FreeFrame.patch(ed, pos, { anim: text }, reselect);
    if (!TYPES.includes(node.type.name) || (node.attrs.anim || '') === text) return false;
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { anim: text })));
    return true;
  }

  // Ouvre la fenêtre « Animation… » (l'extension « diapositives » de GFS : sans elle, la ligne dit pourquoi) pour l'élément du curseur ; sans élément à animer, ou hors d'une présentation, la ligne d'état le dit.
  // Rend vrai quand la fenêtre s'ouvre. `onClose` : rend le clavier à qui l'avait.
  function openForSelection(ed, onClose) {
    if (!ed) return false;
    if (typeof FrameAnimUi === 'undefined' || !SlidesEntry.isAvailable()) { SlidesEntry.explainOff(); return false; }
    if (!SlidesEntry.presentationShown()) { SlidesEntry.status(I18n.t('slides.objects.onlyInPresentation')); return false; }
    const unit = unitAt(ed.state);
    if (!unit) { SlidesEntry.status(I18n.t('frame.anim.noUnit')); return false; }
    FrameAnimUi.open(ed, unit.pos, onClose);
    return true;
  }

  return { TYPES, createExtension, textOf, unitAt, patch, isDecor, openForSelection };
})();
