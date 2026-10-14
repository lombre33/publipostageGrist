// Les espaces autour de ce qui n'écrit rien (retours du 13/10 : « quand deux puces valeurs conditionnelles se suivent, quand une valeur n'est pas validée on
// dirait que ça ajoute un espace », puis « des espaces sont parfois ajoutés avant / après certaines variables ou puces »). Une valeur conditionnelle dont la
// condition n'est pas remplie, une bulle masquée par sa condition, vide, à zéro masqué ou sans ligne dans sa boucle n'écrivent rien ; les espaces tapés autour
// d'elles, eux, restent dans le texte et s'additionnent : « Cher Monsieur , bonjour », « Bonjour  Durand » (deux espaces), un paragraphe qui commence ou finit
// par une espace.
//
// `absorb(node)` retire, à l'endroit où ce nœud est, l'espace que son absence laisse en trop - et elle seule : les espaces tapés ailleurs (deux de suite au
// milieu d'un texte) ne bougent pas. À gauche et à droite du nœud, dans son paragraphe, ce qui touche le nœud est une suite d'espaces (peut-être vide) puis
// le premier signe qui n'en est pas :
//  - des espaces des deux côtés : ceux de droite partent, ceux de gauche restent (« Cher » + _ + « Durand », chacun avec son espace, s'écrit « Cher Durand ») ;
//  - rien à gauche que le début du paragraphe, ou une parenthèse ouvrante : les espaces de droite partent (le nœud était le premier de sa ligne) ;
//  - rien à droite que la fin du paragraphe : les espaces de gauche et de droite partent (le nœud était le dernier de sa ligne) ;
//  - une ponctuation collée au nœud (« Madame, », « Madame. », « Madame! ») : les espaces de gauche partent, elle s'écrit contre le mot d'avant. Une ponctuation
//    séparée du nœud par une espace tapée (« Total _ : 100 ») garde l'espace d'avant : seule celle de droite part, « Total : 100 » reste le texte tapé.
// Une image, une case à cocher, une note de bas de page et toute bulle ou puce pas encore résolue comptent comme du texte : elles ne sont jamais traversées.
//
// Qui l'appelle : js/reader-mode.js au moment de poser la valeur d'une bulle (Lecture, impression, tous les exports, en-têtes et pieds, champs de l'e-mail :
// `settle`) et js/conditional-value.js pour la valeur conditionnelle qu'il retire. Les espaces ne sont retirées que dans le HTML résolu de cette ligne, jamais
// dans le modèle enregistré. En Lecture avec commentaires, un texte qui perd ses premiers caractères garde sa position dans le modèle (`data-pp-pos`).
const SpaceGap = (function () {
  // Les espaces d'un texte : l'espace, l'espace insécable, l'insécable fine et l'espace fine. Ni la tabulation ni le retour à la ligne (une valeur de cellule à
  // plusieurs lignes garde les siens).
  const LEADING = /^[ \u00a0\u202f\u2009]+/;
  const TRAILING = /[ \u00a0\u202f\u2009]+$/;
  const PUNCTUATION = /[,.;:!?)\]}…]/;
  const OPENING = /[(\[{«]/;
  // Les bords : l'espace n'a pas de voisin de l'autre côté. <style> et <script> ne s'écrivent pas : le texte qu'ils portent n'est jamais un voisin.
  const EDGES = new Set([
    'BR', 'HR', 'P', 'DIV', 'LI', 'UL', 'OL', 'DL', 'DT', 'DD', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'COLGROUP', 'H1', 'H2', 'H3',
    'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY', 'STYLE', 'SCRIPT',
    'TEMPLATE',
  ]);
  // Les éléments en ligne qui ne font que mettre un texte en forme : la recherche entre dedans. Tout autre élément écrit quelque chose qui n'est pas du texte
  // (une image, du code) ; les puces et bulles pas encore résolues, des <span>, sont écartées par ATOMS.
  const FORMATTING = new Set(['SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'A', 'MARK', 'SUB', 'SUP', 'SMALL', 'FONT', 'ABBR']);
  const ATOMS = '.var-badge, .calc-badge, .smart-chip, .mention-chip, .conditional-value, .conditional-checkbox, .resolved-checkbox, .footnote-ref-marker, .page-number-badge, .toc-marker';

  // Vrai d'un nœud qui prend la place d'une bulle et n'écrit rien : un texte vide (bulle masquée, boucle sans ligne) ou le <span> vide d'une valeur vide ou
  // d'un zéro masqué. Un fragment d'images ou un <span> qui porte un texte, une case ou une image écrit quelque chose.
  function writesNothing(node) {
    if (!node) return false;
    if (node.nodeType === Node.TEXT_NODE) return node.data === '';
    return node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SPAN' && !node.firstChild;
  }

  // Le plus proche bloc qui contient `node` : le paragraphe, l'item, la case. Sans bloc, le plus haut ancêtre (un fragment).
  function blockOf(node) {
    let top = node.parentNode;
    while (top && top.nodeType === Node.ELEMENT_NODE && !EDGES.has(top.tagName) && top.parentNode) top = top.parentNode;
    return top;
  }

  // Le nœud qui suit (`dir` > 0) ou précède `node` au même niveau, à défaut à celui de son parent, et ainsi de suite sans sortir de `root`.
  function neighbour(node, dir, root) {
    for (let current = node; current && current !== root; current = current.parentNode) {
      const sibling = dir > 0 ? current.nextSibling : current.previousSibling;
      if (sibling) return sibling;
    }
    return null;
  }

  // Le texte non vide qui touche `from` du côté `dir`, ou ce qui l'arrête : { text } ou { stop: 'edge' | 'opaque' }. Un élément de mise en forme se traverse,
  // un texte vide et un commentaire aussi.
  function nextText(from, dir, root) {
    let node = neighbour(from, dir, root);
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.data !== '') return { text: node };
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (EDGES.has(node.tagName)) return { stop: 'edge' };
        if (!FORMATTING.has(node.tagName) || node.matches(ATOMS)) return { stop: 'opaque' };
        const inner = dir > 0 ? node.firstChild : node.lastChild;
        if (inner) { node = inner; continue; }
      }
      node = neighbour(node, dir, root);
    }
    return { stop: 'edge' };
  }

  // La suite d'espaces qui touche `gap` du côté `dir` : { spans: [{ text, from, to }], stop } - `stop` : 'edge', 'opaque' ou le premier signe qui n'est pas une
  // espace. Elle peut courir sur plusieurs textes (le <strong> qui finit par une espace, puis le texte suivant).
  function runAround(gap, dir, root) {
    const spans = [];
    let from = gap;
    for (;;) {
      const next = nextText(from, dir, root);
      if (!next.text) return { spans, stop: next.stop };
      const data = next.text.data;
      const found = (dir > 0 ? LEADING : TRAILING).exec(data);
      if (!found) return { spans, stop: dir > 0 ? data[0] : data[data.length - 1] };
      const start = dir > 0 ? 0 : found.index;
      const end = dir > 0 ? found[0].length : data.length;
      spans.push({ text: next.text, from: start, to: end });
      if (dir > 0 && end < data.length) return { spans, stop: data[end] };
      if (dir < 0 && start > 0) return { spans, stop: data[start - 1] };
      from = next.text;
    }
  }

  // Retire ces espaces. Commentaires en mode Lecture (js/comments.js:buildReaderHtml) : le <span> d'un texte porte la position de son début dans le modèle
  // (`data-pp-pos`, « rendu:position ») et la position d'un point de ce texte se lit à partir d'elle ; un texte qui perd ses premiers caractères la décale
  // d'autant.
  function cut(spans) {
    spans.forEach(({ text, from, to }) => {
      text.deleteData(from, to - from);
      if (from !== 0) return;
      const owner = text.parentNode;
      const tag = owner && owner.nodeType === Node.ELEMENT_NODE ? owner.getAttribute('data-pp-pos') : null;
      const colon = tag ? tag.indexOf(':') : -1;
      const pos = colon < 0 ? NaN : Number(tag.slice(colon + 1));
      if (isFinite(pos)) owner.setAttribute('data-pp-pos', tag.slice(0, colon + 1) + (pos + to - from));
    });
  }

  // Retire les espaces que l'absence de `node` laisse en trop autour de lui ; le nœud lui-même reste où il est (à l'appelant de le retirer).
  function absorb(node) {
    if (!node || !node.parentNode) return;
    const root = blockOf(node);
    if (!root || root.tagName === 'PRE') return;
    const before = runAround(node, -1, root);
    const after = runAround(node, 1, root);
    const spaceBefore = before.spans.length > 0;
    const spaceAfter = after.spans.length > 0;
    const startsLine = before.stop === 'edge' || OPENING.test(before.stop);
    const endsLine = after.stop === 'edge';
    const glued = !spaceAfter && PUNCTUATION.test(after.stop);
    if (spaceAfter && (spaceBefore || startsLine || endsLine)) cut(after.spans);
    if (spaceBefore && (endsLine || glued)) cut(before.spans);
  }

  // La valeur `node` vient d'être posée à la place d'une bulle : si elle n'écrit rien, les espaces qui l'entouraient ne s'additionnent pas. Rend `node`.
  function settle(node) {
    if (writesNothing(node)) absorb(node);
    return node;
  }

  return { writesNothing, absorb, settle };
})();
