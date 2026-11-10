// Un emoji collé depuis Teams, Outlook sur le web, Gmail, WhatsApp Web, Discord ou Slack n'est pas un caractère dans le HTML du presse-papiers mais une petite image
// (`<img alt="😀" src="…">`, le caractère est dans `alt`). L'éditeur ne lit que ses propres images (`img.editor-image`, js/editor-nodes.js) et un champ texte (Objet, À, Cc...)
// que le texte : l'image était écartée et l'emoji disparaissait en silence du collage. Ici, avant que ProseMirror lise le HTML, chaque image dont le texte alternatif
// n'est QUE de l'emoji redevient ce texte : le caractère se colle comme celui qu'on tape ou qu'on colle depuis le texte brut, avec les mêmes sorties (Lecture, PDF, Word...).
//
// Ce qui n'est pas touché : une image de l'éditeur (`img.editor-image`, dont le texte alternatif peut être un emoji que la personne a choisi), une image dont le texte
// alternatif dit autre chose qu'un emoji (« Logo », « :smile: »), une image sans texte alternatif. Le reste du HTML garde ses octets : seule la balise `<img>` est remplacée.
const EmojiPaste = (function () {
  // Un emoji seul, ses suites comprises : pictogramme, teinte de peau, drapeau (deux indicateurs régionaux, ou un drapeau de région par ses balises), touche (« 1️⃣ »), joint
  // de largeur nulle d'une famille ou d'un métier, sélecteur de variante. Rien d'autre : un texte alternatif qui mêle des lettres n'est pas un emoji.
  const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[0-9#*]️?⃣|[\u{E0020}-\u{E007F}]|‍|️)+$/u;
  // Une balise <img> entière, guillemets compris : un `>` dans la valeur d'un attribut ne la coupe pas.
  const IMG_TAG = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

  // Le texte d'une image collée si elle n'est que l'emoji de son texte alternatif, '' sinon.
  function textOfImage(img) {
    if (!img || img.classList.contains('editor-image')) return '';
    const alt = (img.getAttribute('alt') || '').trim();
    return alt && EMOJI_ONLY.test(alt) ? alt : '';
  }

  // Le HTML collé, où chaque image d'emoji est devenue son caractère. Sans balise <img>, le HTML est rendu tel quel.
  function textFromImages(html) {
    const source = String(html == null ? '' : html);
    if (!/<img\b/i.test(source)) return source;
    return source.replace(IMG_TAG, tag => {
      const img = Dom.inertTemplate(tag).content.firstElementChild;
      return textOfImage(img) || tag;
    });
  }

  return { textFromImages, textOfImage, isEmojiOnly: text => EMOJI_ONLY.test(String(text || '')) };
})();
