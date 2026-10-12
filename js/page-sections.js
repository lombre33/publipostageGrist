// Sections d'un document assemblé : un macro-modèle (js/macro-templates.js) peut mêler des modèles portrait, paysage et grille, chacun gardant le sens de sa
// page. Le HTML assemblé le dit lui-même, de façon que la Lecture, le PDF, le Word et l'impression le lisent à l'identique, sans rien demander au macro-modèle :
//  - le saut de page qui ouvre un modèle porte `data-page-orientation="portrait|landscape"` (le sens des pages de ce modèle) ;
//  - un repère de départ, `<div class="page-section-start" data-page-orientation="…">`, vide et sans hauteur, ouvre le premier modèle (rien à couper devant lui) ;
//  - une section est une SUITE de modèles de même sens : un saut de page qui garde le sens de la section en cours reste un saut de page ordinaire dans cette
//    section, seul un changement de sens ouvre une section.
// Sans aucun de ces repères (un document ordinaire, un macro-modèle au sens imposé), rien n'est une section : toutes les sorties gardent la page de PageLayout,
// comme avant. Le format et les marges ne changent jamais d'une section à l'autre (ceux du macro-modèle, pour tous ses modèles) : seul le sens tourne.
// Aucune dépendance au DOM d'une page précise ni à PageLayout : ce module ne fait que lire des repères et découper une suite de nœuds.
const PageSections = (function () {
  const ATTR = 'data-page-orientation';
  const START_CLASS = 'page-section-start';
  const LANDSCAPE = 'landscape';
  const PORTRAIT = 'portrait';

  const isElement = node => !!node && node.nodeType === 1;

  // Le sens porté par un repère, ou null (absent ou illisible : un repère illisible n'ouvre pas de section).
  function senseOf(el) {
    if (!isElement(el)) return null;
    const value = el.getAttribute(ATTR);
    return value === LANDSCAPE || value === PORTRAIT ? value : null;
  }
  const isStart = node => isElement(node) && node.classList.contains(START_CLASS);
  const isBreak = node => isElement(node) && node.classList.contains('page-break-marker');

  // Le repère de départ du premier modèle, en HTML (js/macro-templates.js:buildConcatenatedHtml).
  function startHtml(orientation) {
    return '<div class="' + START_CLASS + '" contenteditable="false" ' + ATTR + '="' + (orientation === LANDSCAPE ? LANDSCAPE : PORTRAIT) + '"></div>';
  }

  // Ce HTML (ou ce nœud) porte-t-il un repère de sens ? Un test de texte, sans rien analyser : appelé avant tout découpage pour que le chemin sans section
  // reste exactement celui d'avant.
  function hasSenses(source) {
    if (typeof source === 'string') return source.indexOf(ATTR) !== -1;
    return !!source && typeof source.querySelector === 'function' && !!source.querySelector('.' + START_CLASS + ', .page-break-marker[' + ATTR + ']');
  }

  // Le sens que dit le repère de départ d'un HTML assemblé (il ouvre le document : on ne cherche que dans son début), ou null. De quoi régler la page de départ
  // avant d'analyser le document, par exemple pour préparer l'en-tête et le pied dans la largeur de la première page.
  function firstSenseOf(html) {
    const head = String(html || '').slice(0, 2000);
    const tag = new RegExp('<div\\b[^>]*\\bclass="[^"]*\\b' + START_CLASS + '\\b[^"]*"[^>]*>').exec(head);
    const sense = tag && new RegExp(ATTR + '="(' + PORTRAIT + '|' + LANDSCAPE + ')"').exec(tag[0]);
    return sense ? sense[1] : null;
  }

  // Les sens employés par ce HTML, dans l'ordre où ils apparaissent (sans doublon) : de quoi savoir quelles variantes d'en-tête et de pied préparer.
  function sensesIn(html) {
    const found = [];
    const pattern = new RegExp(ATTR + '="(' + PORTRAIT + '|' + LANDSCAPE + ')"', 'g');
    let match = pattern.exec(String(html || ''));
    while (match) {
      if (found.indexOf(match[1]) === -1) found.push(match[1]);
      match = pattern.exec(String(html || ''));
    }
    return found;
  }

  // Les sections d'une suite de nœuds de premier niveau (leurs `childNodes`) : [{ orientation, nodes }], dans l'ordre du document. `baseOrientation` : le
  // sens de la page quand rien ne le dit encore (un document sans repère de départ). Le repère de départ n'entre dans aucune section : il a dit son sens et n'a
  // plus rien à montrer. Le saut de page qui ouvre une section reste son premier nœud (les sorties qui coupent les pages à partir des sauts le gardent ;
  // la Lecture, dont chaque section est une pile de feuilles, le retire). Une section peut n'avoir aucun nœud : un modèle vide ouvre quand même sa page.
  function split(nodes, baseOrientation) {
    const base = baseOrientation === LANDSCAPE ? LANDSCAPE : PORTRAIT;
    const sections = [];
    let current = null;
    let start = null;
    Array.from(nodes || []).forEach(node => {
      if (isStart(node)) {
        start = senseOf(node);
        // Des espaces devant le repère ont pu ouvrir la première section : elle prend son sens tant qu'aucun élément n'y est entré.
        if (current && start && !current.nodes.some(isElement)) current.orientation = start;
        return;
      }
      const sense = isBreak(node) ? senseOf(node) : null;
      if (!current) { current = { orientation: start || base, nodes: [] }; sections.push(current); }
      if (sense && sense !== current.orientation) { current = { orientation: sense, nodes: [] }; sections.push(current); }
      current.nodes.push(node);
    });
    // Un repère de départ seul (modèle vide) : une section vide de ce sens, pour que la première page le suive.
    if (!sections.length && start) sections.push({ orientation: start, nodes: [] });
    return sections;
  }

  // Le repère de départ, retiré de la racine : appelé par les sorties une fois son sens lu.
  function stripStart(root) {
    Array.from(root.childNodes).filter(isStart).forEach(node => root.removeChild(node));
  }

  return { ATTR, START_CLASS, LANDSCAPE, PORTRAIT, senseOf, isStart, isBreak, startHtml, hasSenses, firstSenseOf, sensesIn, split, stripStart };
})();
