// Assainissement du HTML qui ne vient pas de l'éditeur : colonne Grist écrite par un autre collaborateur, modèle importé. Document inerte (DOMParser
// : rien ne charge ni ne s'exécute), liste blanche de balises, attributs dangereux retirés, puis relecture jusqu'à un texte stable : ce que le
// navigateur reconstruit en relisant le résultat est ce qui a été vérifié (famille des XSS « de mutation »).
//
// Toute page qui charge js/reader-mode.js doit charger ce fichier avant.
const HtmlSanitize = (function () {
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const MAX_PASSES = 5;
  const MEMO_MAX = 8;

  // Tout ce que l'éditeur écrit, plus les balises de texte courantes : une autre balise est ouverte (son texte reste), jamais gardée.
  const KEPT_TAGS = new Set(('a abbr acronym address article aside b bdi bdo big blockquote br caption center cite code col colgroup dd del dfn div dl dt em figcaption figure font footer ' +
    'h1 h2 h3 h4 h5 h6 header hgroup hr i img input ins kbd label li main mark nav nobr ol p pre q rp rt ruby s samp section small span strike strong sub sup table tbody td tfoot th thead ' +
    'time tr tt u ul var wbr').split(' '));
  // Retirées avec leur contenu : actives, ou lues comme du texte brut (leur contenu, relu après sérialisation, ne redonne pas le même arbre).
  const DROPPED_TAGS = new Set(('script style template noscript noembed noframes xmp plaintext textarea title select datalist iframe frame frameset object embed applet math svg head ' +
    'portal fencedframe').split(' '));
  const DROPPED_ATTRS = new Set(['srcdoc', 'formaction', 'action', 'ping', 'background', 'poster', 'srcset', 'imagesrcset', 'xlink:href', 'data', 'codebase', 'manifest', 'name', 'form',
    'is', 'slot', 'autofocus', 'popover', 'popovertarget', 'popovertargetaction']);

  // Un style qui charge une ressource (url(), image-set()...) fait contacter un site au simple affichage, sans qu'aucune <img> ne le signale
  // (js/external-images.js) : la déclaration est retirée. L'éditeur n'en écrit jamais dans un attribut style (ses images sont des <img>, l'encadré
  // pose son url(data:...) dans une feuille de style de la page). Une propriété personnalisée garde son texte tel quel : un échappement (u\72l) y est
  // refusé, alors que le navigateur le lirait comme url().
  const CSS_LOADS = /url\s*\(|image-set\s*\(|image\s*\(|src\s*\(|cross-fade\s*\(/i;

  // La seule image qu'un style garde : le TRAIT D'ART d'un cadre libre (js/shape-geometry.js : `strokeArt`, `lineArt`, `presetArt`), le dessin de son trait en tirets ou d'une forme de la norme, que
  // css/free-frame.css peint. Il est dans `--ff-art`, `--ff-art-nine` ou `--ff-fill-art` (le fond d'une forme de la norme), en `url("data:image/svg+xml,...")` : une image qui ne charge rien (un SVG
  // employé comme image n'ouvre aucune adresse et n'exécute rien). La valeur n'est gardée que si elle est EXACTEMENT ce que l'éditeur écrit : l'URL ne porte que des caractères d'un texte en
  // pourcentages, et le SVG décodé n'est qu'un `svg` de quatre mesures qui contient des `path` aux attributs de dessin (chemin de droites et de courbes, remplissage, trait, tirets) ; le moindre autre
  // élément, attribut ou caractère la fait retirer comme toute valeur à `url(`.
  const ART_PROPS = new Set(['--ff-art', '--ff-art-nine', '--ff-fill-art']);
  const ART_URL = /^url\("data:image\/svg\+xml,([A-Za-z0-9%_.~-]{1,30000})"\)$/;
  const ART_NUM = /\d+(?:[.]\d+)?/.source;
  const ART_PATH = "<path d='[MLHVACZ0-9. -]*' fill='(?:none|#[0-9a-f]{6})'"
    + "(?: stroke='#[0-9a-f]{6}' stroke-width='" + ART_NUM + "')?(?: stroke-linecap='(?:round|square)')?"
    + "(?: stroke-linejoin='miter' stroke-miterlimit='" + ART_NUM + "')?(?: stroke-dasharray='" + ART_NUM + '(?: ' + ART_NUM + ")*')?(?: stroke-dashoffset='-?" + ART_NUM + "')?/>";
  const ART_SVG = new RegExp("^<svg xmlns='http://www[.]w3[.]org/2000/svg' width='" + ART_NUM + "' height='" + ART_NUM + "' viewBox='0 0 " + ART_NUM + ' ' + ART_NUM
    + "' preserveAspectRatio='none'>(?:" + ART_PATH + ')*</svg>$');
  function isSafeArt(value) {
    const found = ART_URL.exec(String(value || '').trim());
    if (!found) return false;
    try { return ART_SVG.test(decodeURIComponent(found[1])); } catch (e) { return false; }
  }
  function cleanStyle(el) {
    const style = el.style;
    Array.from(style).forEach(prop => {
      const value = style.getPropertyValue(prop);
      if (ART_PROPS.has(prop) && isSafeArt(value)) return;
      if (CSS_LOADS.test(value) || (prop.indexOf('--') === 0 && value.indexOf('\\') !== -1)) style.removeProperty(prop);
    });
    if (!el.getAttribute('style')) el.removeAttribute('style');
  }

  // Les liens ne mènent qu'à une page web, une adresse e-mail ou un numéro (ce que la fenêtre « Lien » de l'éditeur sait écrire, js/link-dialog.js) :
  // l'adresse d'un lien, ou null. Les exports (PDF, Word, e-mail) s'en servent aussi pour savoir quel lien garder.
  function safeLinkHref(href) {
    const value = String(href || '').trim();
    return /^(?:https?:|mailto:|tel:)/i.test(value) ? value : null;
  }

  // Un lien vers un signet du document (js/anchors.js) : `#adresse`, rien d'autre. L'adresse (sans le dièse) ou null. Ce n'est pas une adresse qui sort du document :
  // `safeLinkHref` ne la reconnaît pas, et les exports qui ne savent pas viser un signet (e-mail, Excel) n'écrivent que son texte.
  function internalAnchorId(href) {
    const match = /^#([A-Za-z0-9][A-Za-z0-9_-]{0,63})$/.exec(String(href || '').trim());
    return match ? match[1] : null;
  }

  // Le navigateur ignore espaces et caractères de contrôle dans un schéma (« java\tscript: ») : seul le début de l'adresse compte, une image peut
  // peser des Mo.
  function isActiveSource(src) {
    const head = String(src).slice(0, 80).replace(/[\u0000- ]/g, '').toLowerCase();
    return /^(?:javascript|vbscript|livescript):/.test(head) || /^data:(?!image\/)/.test(head);
  }

  function cleanAttributes(el, tag) {
    Array.from(el.attributes).forEach(attr => {
      const name = attr.name.toLowerCase();
      if (name.indexOf('on') === 0 || DROPPED_ATTRS.has(name)
        || (name === 'href' && tag !== 'a')
        || (name === 'src' && (tag !== 'img' || isActiveSource(attr.value)))) el.removeAttribute(attr.name);
    });
    // Tout autre href d'un <a> (data:, vbscript:, adresse relative...) est retiré : le texte du lien reste, sans cible. Seul un lien vers un signet du document
    // (`#adresse`) reste tel quel.
    if (tag === 'a' && el.hasAttribute('href')) {
      const safe = safeLinkHref(el.getAttribute('href'));
      const anchor = internalAnchorId(el.getAttribute('href'));
      if (safe) el.setAttribute('href', safe); else if (anchor) el.setAttribute('href', '#' + anchor); else el.removeAttribute('href');
    }
    if (el.hasAttribute('style')) cleanStyle(el);
  }

  // Nettoie en place un arbre déjà parsé dans un document inerte, sans jamais le sérialiser : le chemin de l'éditeur le donne tel quel à ProseMirror.
  function sanitizeTree(root) {
    const comments = [];
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach(node => node.remove());
    Array.from(root.querySelectorAll('*')).forEach(el => {
      const tag = el.localName;
      if (el.namespaceURI !== HTML_NS || DROPPED_TAGS.has(tag)) { el.remove(); return; }
      if (!KEPT_TAGS.has(tag)) { el.replaceWith(...Array.from(el.childNodes)); return; }
      // Une case à cocher (liste de tâches) est le seul champ de formulaire que l'éditeur écrit.
      if (tag === 'input' && String(el.getAttribute('type') || '').toLowerCase() !== 'checkbox') { el.remove(); return; }
      cleanAttributes(el, tag);
    });
    return root;
  }

  function parseInert(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return sanitizeTree(doc.body);
  }

  const memo = new Map();

  // Texte stable : nettoyer le résultat ne le change plus. Sans forme stable après MAX_PASSES (une entrée faite pour muter), rien n'est rendu.
  function clean(html) {
    if (!html) return html || '';
    const input = String(html);
    if (memo.has(input)) return memo.get(input);
    let current = input;
    let result = '';
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const next = parseInert(current).innerHTML;
      if (next === current) { result = current; break; }
      current = next;
    }
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
    memo.set(input, result);
    return result;
  }

  return { clean, parseInert, safeLinkHref, internalAnchorId, isSafeArt };
})();
