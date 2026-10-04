// Légende : un paragraphe posé juste sous une image ou un tableau, en petit, en italique et en gris. Ce n'est pas un nouveau nœud : un paragraphe
// ordinaire qui porte l'attribut `caption` (`<p data-caption="true">`, planning/feature-content-blocks.md, « Légende »), de sorte que son texte garde
// tout ce qu'un paragraphe sait faire (gras, couleur, variables, liens, alignement). Le style est le même partout : css/caption.css pour l'éditeur,
// la Lecture et les zones d'en-tête / pied ; `inheritedStyle` de js/pdf-export.js et `inheritedRunStyle` de js/docx-export.js lisent ici la taille et
// la couleur (SIZE_PT, COLOR). Un e-mail n'a que du texte : la légende y est une ligne comme une autre.
//
// Les deux barres flottantes (js/floating-toolbars.js) ont un bouton « Légende », sous une image comme sous un tableau. Sans légende, il en pose une,
// vide, juste après le bloc (après le paragraphe qui porte l'image) et y met le curseur ; avec une légende, il est actif et y ramène le curseur,
// jamais un retrait : aucun texte ne se perd (une légende vide se retire comme un paragraphe vide, par Retour arrière). Il est grisé, avec sa raison
// en info-bulle, pour une image en calque ou habillée par le texte (il n'y a pas de « dessous ») et dans une grille.
//
// « Rester ensemble » : au saut de page, la légende reste avec son bloc, jamais seule en haut de la page suivante. L'éditeur
// (js/header-footer-preview.js), la Lecture (js/reader-mode.js), le PDF (js/pdf-export.js) et le Word (js/docx-export.js) le décident sur le HTML ;
// `carriesCaption` et `captionsAfter` disent de quel bloc et de quelles légendes il s'agit, `fitsWithCaption` à partir de quelle hauteur le bloc et
// sa légende ne tiennent plus ensemble dans une page (ils restent alors comme avant).
const Caption = (function () {
  // 12 px = 9 pt, contre 14 px pour le texte courant. #595959 : 7:1 sur la feuille, qui reste blanche en thème sombre (css/editor-v2.css,
  // #editor-container).
  const SIZE_PX = 12;
  const SIZE_PT = SIZE_PX * 0.75;
  const COLOR = '#595959';

  const isCaption = node => !!node && !!node.type && node.type.name === 'paragraph' && !!node.attrs.caption;

  // `libs` : les classes de ProseMirror que js/editor.js a déjà chargées ({ Plugin, PluginKey, Decoration, DecorationSet }).
  function createExtension(Extension, libs) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = libs;
    return Extension.create({
      name: 'caption',
      addGlobalAttributes() {
        return [{
          types: ['paragraph'],
          attributes: {
            caption: {
              default: false,
              // Entrée à la fin d'une légende ouvre un paragraphe ordinaire, comme dans Word.
              keepOnSplit: false,
              parseHTML: el => el.hasAttribute('data-caption') && el.getAttribute('data-caption') !== 'false',
              renderHTML: attrs => (attrs.caption ? { 'data-caption': 'true' } : {}),
            },
          },
        }];
      },
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey('captionPlaceholder'),
          props: {
            // « Légende… » en gris dans la légende vide où se trouve le curseur, à toute profondeur (une cellule, une colonne) : le Placeholder de
            // TipTap ne regarde que les blocs du premier niveau. Une décoration de l'éditeur seulement : rien n'en reste dans le document ni dans les
            // exports.
            decorations(state) {
              const { selection } = state;
              if (!selection.empty) return null;
              const node = selection.$from.parent;
              if (!isCaption(node) || node.content.size) return null;
              const pos = selection.$from.before();
              return DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, { class: 'caption-empty', 'data-caption-placeholder': I18n.t('caption.placeholder') })]);
            },
          },
        })];
      },
    });
  }

  // Où se pose la légende
  // La légende d'un bloc est le paragraphe qui le suit : `pos` est la fin du bloc, dans son conteneur (le document, une case, une colonne, un
  // encadré...).
  function followingCaption(doc, pos) {
    const next = doc.resolve(pos).nodeAfter;
    return isCaption(next) ? { node: next, pos } : null;
  }

  // L'image sélectionnée (une vraie sélection de nœud, comme la barre flottante de l'image) : la légende se pose après le paragraphe qui la porte.
  function imageTarget(editor) {
    const { selection } = editor.state;
    const node = selection.node;
    if (!node || !node.type || node.type.name !== 'editorImage' || selection.$from.depth < 1) return null;
    return { node, pos: selection.$from.after(selection.$from.depth), paragraph: selection.$from.parent };
  }

  // Le tableau qui contient le curseur (le plus profond, pour un tableau dans une case) : la légende se pose après lui.
  function tableTarget(editor) {
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.name === 'table') return { node: $from.node(depth), pos: $from.after(depth), paragraph: null };
    }
    return null;
  }

  // Une image centrée (ou dans un paragraphe aligné) a sa légende alignée de la même façon ; un tableau, la sienne à gauche.
  function alignmentFor(target) {
    if (target.node.type.name === 'editorImage' && target.node.attrs.align === 'center') return 'center';
    return (target.paragraph && target.paragraph.attrs.textAlign) || null;
  }

  // `kind` : 'image' ou 'table'. null quand le bloc n'est pas celui de la sélection ; sinon `locked` (la clé de la raison, ou null), `present` (une
  // légende suit déjà le bloc).
  function status(editor, kind) {
    const target = kind === 'image' ? imageTarget(editor) : tableTarget(editor);
    if (!target) return null;
    let locked = null;
    if (GridEditor.isActive()) locked = 'caption.gridLocked';
    else if (kind === 'image' && target.node.attrs.layer && target.node.attrs.layer !== 'normal') locked = 'caption.imageLayer';
    else if (kind === 'image' && (target.node.attrs.align === 'left' || target.node.attrs.align === 'right')) locked = 'caption.imageFloat';
    return { target, locked, present: !!followingCaption(editor.state.doc, target.pos) };
  }

  // Le bouton « Légende » d'une barre flottante, à l'état de son bloc : actif quand une légende existe ; grisé par aria-disabled (jamais `disabled` :
  // un bouton désactivé ne reçoit plus le survol, et son info-bulle dit pourquoi) avec sa raison ; sinon son intitulé.
  function syncButton(button, editor, kind) {
    const s = button && editor ? status(editor, kind) : null;
    if (!s) return;
    const title = I18n.t(s.locked || (s.present ? 'caption.goTo' : kind === 'image' ? 'caption.addImage' : 'caption.addTable'));
    button.classList.toggle('is-active', s.present && !s.locked);
    button.classList.toggle('is-disabled', !!s.locked);
    button.setAttribute('aria-disabled', s.locked ? 'true' : 'false');
    button.title = title;
    button.setAttribute('aria-label', title);
  }

  // Le clic sur le bouton : pose la légende vide sous le bloc et y met le curseur, ou ramène le curseur à la fin de celle qui y est déjà. Une seule
  // transaction (un Annuler la retire). Faux, sans rien changer, quand le bouton est grisé, quand l'éditeur n'est pas modifiable ou quand le
  // conteneur n'accepte pas un paragraphe à cet endroit.
  function run(editor, kind) {
    if (!editor || !editor.isEditable) return false;
    const s = status(editor, kind);
    if (!s || s.locked) return false;
    const { state, view } = editor;
    const TextSelection = EditorCore.getTextSelectionClass();
    const { pos } = s.target;
    const existing = followingCaption(state.doc, pos);
    if (existing) {
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos + existing.node.nodeSize - 1)).scrollIntoView());
      view.focus();
      return true;
    }
    const type = state.schema.nodes.paragraph;
    const $pos = state.doc.resolve(pos);
    if (!$pos.parent.canReplaceWith($pos.index(), $pos.index(), type)) return false;
    const tr = state.tr.insert(pos, type.create({ caption: true, textAlign: alignmentFor(s.target) }));
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    view.dispatch(tr.scrollIntoView());
    // Suivi des modifications : la bibliothèque rejoue la transaction en suggestion et décale encore la sélection, déjà exprimée dans le nouveau
    // document, de la taille de ce qui vient d'être inséré - le curseur se retrouvait au début du paragraphe suivant. Une seconde transaction, sans
    // pas (rien de plus à annuler), le remet dans la légende.
    const inserted = followingCaption(view.state.doc, pos);
    if (inserted && view.state.selection.$from.parent !== inserted.node) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)));
    view.focus();
    return true;
  }

  // Au saut de page
  const isCaptionElement = el => !!el && el.nodeType === 1 && el.tagName === 'P' && el.hasAttribute('data-caption') && el.getAttribute('data-caption') !== 'false';

  // Le bloc de premier niveau qui peut porter une légende : un paragraphe qui contient une image, un tableau (l'enveloppe .tableWrapper de l'éditeur,
  // le <table> du HTML sérialisé). Une légende n'en porte jamais une autre.
  function carriesCaption(el) {
    if (!el || el.nodeType !== 1 || isCaptionElement(el)) return false;
    return el.tagName === 'TABLE' || el.classList.contains('tableWrapper') || (el.tagName === 'P' && !!el.querySelector('img'));
  }

  // Les légendes qui suivent le bloc `el` (les frères qui se suivent, jusqu'au premier qui n'en est pas une), [] si `el` n'en porte pas. `endEl` : le
  // frère où l'on s'arrête sans le compter (les lignes vides de fin de document, que l'aperçu laisse hors de la pagination).
  function captionsAfter(el, endEl) {
    const out = [];
    if (!carriesCaption(el)) return out;
    for (let next = el.nextElementSibling; next && next !== endEl && isCaptionElement(next); next = next.nextElementSibling) out.push(next);
    return out;
  }

  // Un bloc et ses légendes ne se gardent ensemble que s'ils tiennent dans une page, et même dans 90 % d'une page : au-delà, pdfmake (qui range le
  // bloc d'une pièce) en perdrait une partie, et le PDF ne peut pas faire ce que l'éditeur ferait (même plafond que pour une ligne de tableau,
  // js/table-page-cut.js). `unitHeight` et `pageHeight` dans la même unité.
  function fitsWithCaption(unitHeight, pageHeight) {
    return unitHeight <= TablePageCut.MAX_ROW_RATIO * pageHeight;
  }

  return { SIZE_PX, SIZE_PT, COLOR, createExtension, status, syncButton, run, isCaptionElement, carriesCaption, captionsAfter, fitsWithCaption };
})();
