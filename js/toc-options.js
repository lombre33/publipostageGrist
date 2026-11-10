// Les réglages d'un sommaire : les niveaux de titres qu'il liste (du premier au dernier, de 1 à 6) et le numéro de page de chaque titre, affiché ou non. Ils se posent dans la barre qui
// surmonte le sommaire dans l'éditeur (js/floating-toolbars.js:createTocToolbar), vivent sur le nœud « toc » (js/editor-nodes.js) et s'écrivent dans le HTML du modèle en `data-toc-from`,
// `data-toc-to` et `data-toc-pages="false"` - chacun seulement quand il n'est pas celui d'avant : un sommaire sans réglage s'écrit comme il s'écrivait. Ce module ne connaît que ces règles ;
// chaque sortie (la Lecture, le PDF, le Word, le HTML, le Markdown) les applique à sa façon, avec `covers`.
const TocOptions = (function () {
  const MIN_LEVEL = 1;
  const MAX_LEVEL = 6;
  // Tous les niveaux, avec les numéros de page : ce que tout sommaire listait avant les réglages.
  const DEFAULTS = Object.freeze({ from: MIN_LEVEL, to: MAX_LEVEL, pages: true });
  const ATTR_FROM = 'data-toc-from';
  const ATTR_TO = 'data-toc-to';
  const ATTR_PAGES = 'data-toc-pages';

  const levelOf = (value, fallback) => {
    const level = parseInt(value, 10);
    return level >= MIN_LEVEL && level <= MAX_LEVEL ? level : fallback;
  };

  // Les réglages tels qu'on les lit, de n'importe quelle forme (le nœud, une page ancienne, un collage) : deux niveaux entiers de 1 à 6 rangés du premier au dernier, un booléen. Ce qui manque
  // ou n'a pas de sens prend la valeur d'avant les réglages.
  function normalize(raw) {
    const source = raw || {};
    const first = levelOf(source.from, MIN_LEVEL);
    const last = levelOf(source.to, MAX_LEVEL);
    return { from: Math.min(first, last), to: Math.max(first, last), pages: !(source.pages === false || source.pages === 'false') };
  }

  const isDefault = options => {
    const o = normalize(options);
    return o.from === DEFAULTS.from && o.to === DEFAULTS.to && o.pages === DEFAULTS.pages;
  };

  // Ce que le nœud garde : rien (null) tant que les réglages sont ceux d'avant, sinon l'objet rangé. Un retour aux valeurs d'avant efface donc les attributs du HTML.
  const stored = options => (isDefault(options) ? null : normalize(options));

  // Les attributs `data-toc-*` d'un sommaire, un seul par réglage qui n'est pas celui d'avant.
  function domAttrs(options) {
    const o = normalize(options);
    const attrs = {};
    if (o.from !== DEFAULTS.from) attrs[ATTR_FROM] = String(o.from);
    if (o.to !== DEFAULTS.to) attrs[ATTR_TO] = String(o.to);
    if (!o.pages) attrs[ATTR_PAGES] = 'false';
    return attrs;
  }

  // Les réglages écrits sur le repère `div.toc-marker` d'un HTML (l'éditeur, une page résolue, un collage).
  function ofElement(el) {
    if (!el || !el.getAttribute) return normalize(null);
    return normalize({ from: el.getAttribute(ATTR_FROM), to: el.getAttribute(ATTR_TO), pages: el.getAttribute(ATTR_PAGES) });
  }

  // Les réglages d'après un changement : `patch` ({ from, to, pages }, chaque clé facultative) posé sur `current`. Le niveau qu'on vient de choisir l'emporte sur l'autre bout : monter le
  // premier niveau au-dessus du dernier emmène le dernier avec lui, descendre le dernier sous le premier emmène le premier.
  function change(current, patch) {
    const next = normalize(current);
    const wanted = patch || {};
    const first = levelOf(wanted.from, null);
    const last = levelOf(wanted.to, null);
    if (first !== null) { next.from = first; if (next.to < first) next.to = first; }
    if (last !== null) { next.to = last; if (next.from > last) next.from = last; }
    if (typeof wanted.pages === 'boolean') next.pages = wanted.pages;
    return next;
  }

  // Un titre de ce niveau est-il listé ?
  const covers = (options, level) => {
    const o = normalize(options);
    return level >= o.from && level <= o.to;
  };

  return { MIN_LEVEL, MAX_LEVEL, DEFAULTS, ATTR_FROM, ATTR_TO, ATTR_PAGES, normalize, change, isDefault, stored, domAttrs, ofElement, covers };
})();
