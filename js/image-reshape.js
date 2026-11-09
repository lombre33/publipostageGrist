// Pivoter, retourner et rogner l'image sélectionnée (les boutons « Pivoter à gauche », « Pivoter à droite », « Retourner » et « Rogner… » de la barre de l'image, js/floating-toolbars.js).
// Une image du document se règle par sa largeur et garde ses proportions : chaque geste REDESSINE ses points (ImageIo.reshape, un canvas) et remplace l'image par la nouvelle, dans UN pas de
// l'historique (Annuler rend l'image d'avant). L'image qui en sort est une image ordinaire, que la Lecture, le PDF, le Word, le PowerPoint, le HTML et le courriel reprennent déjà : rien d'autre
// ne change dans les exports. Ce que le geste fait à la taille : un quart de tour échange la largeur et la hauteur de l'image à l'écran (une photo de 300 sur 200 devient 200 sur 300, comme dans
// Word) ; un miroir ne la change pas.
//   ImageReshape.unavailableKey(attrs) -> la clé du texte qui dit pourquoi cette image ne se tourne ni ne se rogne pas, ou '' (la barre grise ses boutons avec ce texte, elle n'en retire aucun)
//   ImageReshape.run(editor, action) -> Promise<boolean> ; `action` : 'turn-left', 'turn-right', 'flip'. Les gestes s'enchaînent un à un (deux clics rapides font deux gestes), chacun lit
//     l'image au moment où il passe ; il ne fait rien quand l'image a changé ou quitté la sélection entre-temps. Vrai quand l'image a été remplacée.
const ImageReshape = (function () {
  const MOVES = {
    'turn-left': { turn: 270 },
    'turn-right': { turn: 90 },
    flip: { flipH: true },
  };
  const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|bmp)[;,]/i;

  // Pourquoi l'image ne se règle pas : une image qui vient d'ailleurs (la colonne Pièces jointes d'une ligne, un QR code, un graphique, une vidéo : elle est dessinée à la Lecture), une image
  // vectorielle (un canvas la réduirait à des points), une image d'un autre site (le navigateur ne laisse pas lire ses points).
  function unavailableKey(attrs) {
    const image = attrs || {};
    if (image.varTable || image.qrText || image.chartSection || image.chartSpec || image.video || !image.src) return 'imgToolbar.reshapeNeedsPicture';
    if (/^data:image\/svg/i.test(image.src)) return 'imgToolbar.reshapeVector';
    if (!DATA_IMAGE.test(image.src)) return 'imgToolbar.reshapeExternal';
    return '';
  }

  // L'image sélectionnée de l'éditeur : { node, pos } ou null.
  function selectedImage(editor) {
    const selection = editor.state.selection;
    const node = selection.node;
    return node && node.type && node.type.name === 'editorImage' ? { node, pos: selection.from } : null;
  }

  // La largeur de l'image à l'écran, en pixels : celle que son attribut écrit ; une largeur autrement écrite (un pourcentage) se mesure sur l'image affichée.
  function widthPx(editor, attrs, pos) {
    if (/^\s*[\d.]+\s*px\s*$/.test(String(attrs.width || ''))) return parseFloat(attrs.width);
    const dom = editor.view.nodeDOM(pos);
    const img = dom && dom.querySelector ? dom.querySelector('img') : null;
    return (img && img.offsetWidth) || parseFloat(attrs.width) || 320;
  }

  // Remplace l'image à `pos` par ses attributs `attrs`. L'image reste sélectionnée si elle l'était ; si la personne est passée ailleurs entre-temps, sa sélection n'est pas volée.
  function replace(editor, pos, attrs) {
    const selected = selectedImage(editor);
    if (selected && selected.pos === pos) {
      EditorCore.patchNodeAndReselect(editor, pos, attrs);
    } else {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs));
    }
  }

  async function apply(editor, action) {
    const move = MOVES[action];
    const found = move ? selectedImage(editor) : null;
    if (!found || unavailableKey(found.node.attrs)) return false;
    const { pos } = found;
    const attrs = found.node.attrs;
    const width = widthPx(editor, attrs, pos);
    let out;
    try {
      out = await ImageIo.reshape(attrs.src, move);
    } catch (e) {
      Dialogs.notice({ title: I18n.t('imgToolbar.reshapeFailed.title'), message: I18n.t('imgToolbar.reshapeFailed.message'), closeLabel: I18n.t('common.close') });
      return false;
    }
    if (!out) return false;
    const now = editor.state.doc.nodeAt(pos);
    if (!now || now.type.name !== 'editorImage' || now.attrs.src !== attrs.src) return false;
    const patch = { src: out.src };
    // Un quart de tour : l'image garde sa taille à l'écran, tournée - sa nouvelle largeur est son ancienne hauteur.
    if (move.turn === 90 || move.turn === 270) patch.width = Math.round(width * out.width / out.height * 100) / 100 + 'px';
    replace(editor, pos, Object.assign({}, now.attrs, patch));
    return true;
  }

  let queue = Promise.resolve();
  function run(editor, action) {
    queue = queue.then(() => apply(editor, action)).catch(() => false);
    return queue;
  }

  return { unavailableKey, run };
})();
