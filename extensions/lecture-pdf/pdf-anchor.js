// L'ancre d'un commentaire de PDF (extension « lecture-pdf », consigne GFS 045) : de quoi dire OÙ est le passage commenté, et le retrouver quand le PDF a changé. Un PDF n'a ni marque ni document où la poser : l'ancre est du TEXTE, jamais des
// pixels (ni coordonnées d'écran, ni zoom) - la page, la place du passage dans le texte de cette page, le passage lui-même (la citation) et un peu de texte avant et après pour départager deux passages identiques. Ce fichier ne touche
// à aucun élément de page : il ne connaît que les éléments que pdf.js rend pour une page (`getTextContent().items`, dont seuls `str` et `hasEOL` comptent), si bien que l'ancre s'écrit et se retrouve de la même façon pour une page
// dessinée et pour une page qui ne l'est pas (la couche de texte d'une page hors de l'écran n'existe pas : extensions/lecture-pdf/pdf-view.js n'en garde que quelques-unes).
//  - LE TEXTE D'UNE PAGE, `pageText(items)` : les `str` des éléments mis bout à bout, une espace à chaque fin de ligne (`hasEOL`), les espaces multiples, les espaces insécables et les fines réduits à UNE espace, sans espace au début
//    ni à la fin. UNE SEULE fonction sert à écrire l'ancre et à la retrouver : une sélection à la souris et le texte de la page se comparent signe à signe. `item(k)` et `offset(k)` disent d'où vient le signe `k` : le numéro de l'élément
//    (de ceux qui ont un `str`, le rang de sa couche de texte dans `TextLayer.textDivs`) et sa place dans son `str` ; une espace de fin de ligne, ou celle qui en remplace plusieurs, vient de la première des espaces d'origine (ou de la fin de l'élément).
//  - L'ANCRE, `anchorFromRange(page, text, start, end)` -> { page, debut, fin, citation, avant, apres } (positions dans `text`, `fin` exclue, sans espace aux deux bouts), ou null sans texte.
//  - LE PASSAGE RETROUVÉ, `locate(text, anchor)` -> { debut, fin } ou null : d'abord là où il était (la citation y est toujours), sinon par sa citation dans la page, le passage dont l'entourage ressemble le plus quand plusieurs conviennent.
//    `relocate(anchor, pageCount, textOf, options)` le cherche dans tout le PDF, page par page : celle où il était, puis les autres par ordre de distance. `textOf(n)` rend la promesse du `pageText` de la page `n` ; la boucle rend la main au
//    navigateur entre deux pages (la lecture n'est jamais bloquée) et s'arrête quand `options.cancelled()` dit vrai. Elle ne lit que ce qu'il faut : un passage retrouvé avec tout son entourage arrête la recherche.
//    PdfAnchor.pageText(items) -> { text, length, item(k), offset(k) }    PdfAnchor.anchorFromRange(page, pageText, start, end)    PdfAnchor.locate(text, anchor)    PdfAnchor.relocate(anchor, pageCount, textOf, options) -> Promise<{ page, debut, fin } | null>
//    PdfAnchor.pointOf(pageText, item, offset) -> la place dans `text` d'un point de la couche de texte    PdfAnchor.CONTEXT
const PdfAnchor = (function () {
  // Le nombre de signes gardés avant et après le passage : de quoi départager deux passages identiques, pas de quoi grossir la table.
  const CONTEXT = 24;
  // Les blancs que le texte d'une page réduit à une espace : ceux de `\s` (espaces, tabulations, retours, insécables U+00A0, fines U+2009 et U+202F - celle que le français met entre les milliers -, espace de chiffre U+2007).
  const SPACE = /\s/;

  function pageText(items) {
    const chars = [];
    const from = [];     // pour chaque signe de `chars` : l'élément d'où il vient...
    const place = [];    // ... et sa place dans le `str` de cet élément
    let lastSpace = false;
    let rank = -1;
    (Array.isArray(items) ? items : []).forEach((entry) => {
      if (!entry || typeof entry.str !== 'string') return;   // un repère de contenu balisé n'a pas de texte, ni de couche de texte
      rank++;
      const str = entry.str;
      for (let k = 0; k < str.length; k++) {
        if (SPACE.test(str[k])) {
          if (!lastSpace && chars.length) { chars.push(' '); from.push(rank); place.push(k); lastSpace = true; }
        } else { chars.push(str[k]); from.push(rank); place.push(k); lastSpace = false; }
      }
      if (entry.hasEOL === true && !lastSpace && chars.length) { chars.push(' '); from.push(rank); place.push(str.length); lastSpace = true; }
    });
    if (chars.length && chars[chars.length - 1] === ' ') { chars.pop(); from.pop(); place.pop(); }
    return { text: chars.join(''), item: k => from[k], offset: k => place[k], length: chars.length };
  }

  // L'ancre du passage [start, end) de la page `page` dont le texte est `source` (le rendu de pageText) : sans les espaces des deux bouts, ou null quand il ne reste rien.
  function anchorFromRange(page, source, start, end) {
    const text = source.text;
    let from = Math.max(0, Math.min(text.length, Math.floor(start)));
    let to = Math.max(0, Math.min(text.length, Math.floor(end)));
    while (from < to && text[from] === ' ') from++;
    while (to > from && text[to - 1] === ' ') to--;
    if (!(to > from)) return null;   // aussi quand une borne n'est pas un nombre
    return { page, debut: from, fin: to, citation: text.slice(from, to), avant: text.slice(Math.max(0, from - CONTEXT), from), apres: text.slice(to, to + CONTEXT) };
  }

  // La place dans `text` d'un point de la couche de texte : le signe `offset` du `str` de l'élément `item`. C'est le rang du premier signe du texte de la page qui n'est pas avant ce point, donc le début d'un passage qui commence là et la fin
  // (exclue) d'un passage qui s'arrête là. Un point au milieu d'une suite d'espaces réduite à une seule retombe sur la suite ; rien n'y est perdu, anchorFromRange retire les espaces des deux bouts. Rend null pour une page sans texte.
  function pointOf(source, item, offset) {
    const n = source.length;
    if (!n) return null;
    const before = k => source.item(k) < item || (source.item(k) === item && source.offset(k) < offset);
    // Recherche dichotomique : le premier signe qui n'est pas avant le point.
    let low = 0;
    let high = n;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (before(middle)) low = middle + 1; else high = middle;
    }
    return low;
  }

  // Les places de `needle` dans `text`, de gauche à droite.
  function occurrences(text, needle) {
    const found = [];
    if (!needle) return found;
    let at = text.indexOf(needle);
    while (at !== -1) { found.push(at); at = text.indexOf(needle, at + 1); }
    return found;
  }

  // Combien de signes de l'entourage de l'ancre se retrouvent autour de la place `at` du passage dans `text` : la longueur commune de la fin de `avant` et de ce qui précède, plus celle du début de `apres` et de ce qui suit.
  function contextScore(text, at, anchor) {
    const end = at + anchor.citation.length;
    const before = text.slice(Math.max(0, at - anchor.avant.length), at);
    const after = text.slice(end, end + anchor.apres.length);
    let score = 0;
    for (let k = 1; k <= Math.min(before.length, anchor.avant.length) && before[before.length - k] === anchor.avant[anchor.avant.length - k]; k++) score++;
    for (let k = 0; k < Math.min(after.length, anchor.apres.length) && after[k] === anchor.apres[k]; k++) score++;
    return score;
  }
  // Le score d'un entourage entier : celui que la page d'origine a donné à l'ancre quand elle a été écrite.
  const fullScore = anchor => (anchor.avant || '').length + (anchor.apres || '').length;
  // Une place enregistrée : le nombre de la cellule, ou NaN quand elle est vide (une cellule vide n'est pas la place 0).
  const placeOf = value => (value === null || value === undefined || value === '' ? NaN : Number(value));

  // Le passage de `anchor` dans le texte `text` d'une page : { debut, fin, score } ou null. D'abord là où il était, sinon la place de sa citation qui a le meilleur entourage, la plus proche de l'ancienne en cas d'égalité.
  function locate(text, anchor) {
    if (!anchor || typeof anchor.citation !== 'string' || !anchor.citation || typeof text !== 'string') return null;
    const at = placeOf(anchor.debut);
    if (Number.isInteger(at) && at >= 0 && text.slice(at, at + anchor.citation.length) === anchor.citation) {
      return { debut: at, fin: at + anchor.citation.length, score: contextScore(text, at, anchor) };
    }
    let best = null;
    occurrences(text, anchor.citation).forEach((place) => {
      const score = contextScore(text, place, anchor);
      const gap = Math.abs(place - (Number.isFinite(at) ? at : 0));
      if (!best || score > best.score || (score === best.score && gap < best.gap)) best = { debut: place, fin: place + anchor.citation.length, score, gap };
    });
    return best ? { debut: best.debut, fin: best.fin, score: best.score } : null;
  }

  const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

  // Le passage de `anchor` dans tout le PDF : la page où il était d'abord, puis les autres de la plus proche à la plus lointaine (une page avant, une page après, deux pages avant...). Un passage retrouvé sur la page où il était, ou ailleurs
  // avec tout son entourage, arrête la recherche ; sinon elle va jusqu'au bout et garde le meilleur entourage (le plus proche de l'ancienne page en cas d'égalité). Rend { page, debut, fin } ou null.
  async function relocate(anchor, pageCount, textOf, options) {
    const cancelled = (options && options.cancelled) || (() => false);
    const last = Math.floor(Number(pageCount)) || 0;
    if (last < 1 || !anchor || typeof anchor.citation !== 'string' || !anchor.citation || typeof textOf !== 'function') return null;
    // La page où le passage était. Quand le PDF n'a plus autant de pages, la recherche part de la plus proche, mais cette page-là n'est pas « la page d'origine » : un passage à moitié reconnu n'y arrête rien.
    const wanted = Math.floor(Number(anchor.page));
    const known = wanted >= 1 && wanted <= last;
    const origin = known ? wanted : (wanted > last ? last : 1);
    const order = [origin];
    for (let step = 1; step < last; step++) {
      if (origin - step >= 1) order.push(origin - step);
      if (origin + step <= last) order.push(origin + step);
    }
    const perfect = fullScore(anchor);
    let best = null;
    for (let k = 0; k < order.length; k++) {
      if (cancelled()) return null;
      const n = order[k];
      let source = null;
      try { source = await textOf(n); } catch (e) { source = null; }
      if (cancelled()) return null;
      const home = known && n === origin;
      const found = source && source.text ? locate(source.text, home ? anchor : Object.assign({}, anchor, { debut: -1 })) : null;
      if (found) {
        // Sur la page d'origine, la citation suffit : là où elle était, ou ailleurs sur cette page (le meilleur entourage). Sur les autres, il faut tout l'entourage pour s'arrêter.
        if (home || found.score >= perfect) return { page: n, debut: found.debut, fin: found.fin };
        if (!best || found.score > best.score) best = { page: n, debut: found.debut, fin: found.fin, score: found.score };
      }
      if (k < order.length - 1) await yieldToBrowser();
    }
    return best ? { page: best.page, debut: best.debut, fin: best.fin } : null;
  }

  return { pageText, anchorFromRange, pointOf, locate, relocate, CONTEXT };
})();
