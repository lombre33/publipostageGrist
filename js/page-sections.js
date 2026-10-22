// Sections d'un document assemblé : un macro-modèle (js/macro-templates.js) peut mêler des modèles portrait, paysage et grille, chacun gardant le sens de sa
// page, et des présentations, dont la page est celle d'une diapositive (16:9). Le HTML assemblé le dit lui-même, de façon que la Lecture, le PDF, le Word et l'impression le lisent
// à l'identique, sans rien demander au macro-modèle :
//  - le saut de page qui ouvre un modèle porte `data-page-orientation="portrait|landscape"` (le sens des pages de ce modèle), et `data-page-format="A4|190.5x338.7|…"` quand le
//    format de ses pages n'est pas celui des marges du macro-modèle (une présentation : sa diapositive) ; sans lui, le format reste celui du macro-modèle ;
//  - un repère de départ, `<div class="page-section-start" data-page-orientation="…" data-page-format="…">`, vide et sans hauteur, ouvre le premier modèle (rien à couper devant lui) ;
//  - une section est une SUITE de modèles de même sens ET de même format : un saut de page qui garde la page de la section en cours reste un saut de page ordinaire dans cette
//    section, seul un changement de sens ou de format ouvre une section.
// Sans aucun de ces repères (un document ordinaire, un macro-modèle au sens imposé), rien n'est une section : toutes les sorties gardent la page de PageLayout, comme avant. Les marges ne
// changent jamais d'une section à l'autre (celles du macro-modèle, pour tous ses modèles) : seuls le sens et le format tournent.
// Aucune dépendance au DOM d'une page précise ni à PageLayout : ce module ne fait que lire des repères et découper une suite de nœuds. Une page est `{ orientation, format }`, le format
// étant l'identifiant de PageLayout (« A4 », « 190.5x338.7 ») ou null (celui des marges).
const PageSections = (function () {
  const ATTR = 'data-page-orientation';
  const FORMAT_ATTR = 'data-page-format';
  // Le saut de page que le menu du bouton Page a posé lui-même (js/page-sense-edit.js) pour tourner une seule page : il ne dit rien aux sorties, il dit seulement au menu qu'il peut le retirer.
  const ADDED_ATTR = 'data-page-added';
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

  // Un format tel que PageLayout l'écrit : un nom de format (« A4 ») ou « LARGEURxHAUTEUR » en millimètres (« 190.5x338.7 »), dans l'écriture que PageLayout.normalizeFormat rend (nom en
  // majuscules, dimensions en minuscules) ; null pour tout autre texte, qui n'est pas un format (absent ou illisible : le format des marges).
  function formatToken(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (/^[A-Za-z]\d$/.test(text)) return text.toUpperCase();
    return /^\d{1,3}(?:\.\d)?x\d{1,3}(?:\.\d)?$/i.test(text) ? text.toLowerCase() : null;
  }
  // Le format porté par un repère, ou null (absent ou illisible : celui des marges).
  function formatOf(el) { return isElement(el) ? formatToken(el.getAttribute(FORMAT_ATTR)) : null; }
  // La page que dit un repère : `{ orientation, format }`, ou null sans sens lisible (un format seul ne dit rien : il accompagne toujours un sens).
  function pageOf(el) {
    const orientation = senseOf(el);
    return orientation ? { orientation, format: formatOf(el) } : null;
  }

  // Les attributs d'un repère pour cette page (un sens, ou `{ orientation, format }`), avec l'espace qui les précède : le sens toujours, le format quand il y en a un.
  function attrsFor(page) {
    const wanted = typeof page === 'string' ? { orientation: page } : page || {};
    const format = formatToken(wanted.format);
    return ' ' + ATTR + '="' + (wanted.orientation === LANDSCAPE ? LANDSCAPE : PORTRAIT) + '"' + (format ? ' ' + FORMAT_ATTR + '="' + format + '"' : '');
  }

  // Le repère de départ du premier modèle, en HTML (js/macro-templates.js:buildConcatenatedHtml). `orientation` peut être la page entière (`{ orientation, format }`).
  function startHtml(orientation, format) {
    const page = orientation && typeof orientation === 'object' ? orientation : { orientation, format };
    return '<div class="' + START_CLASS + '" contenteditable="false"' + attrsFor(page) + '></div>';
  }

  // Ce HTML (ou ce nœud) porte-t-il un repère de sens ? Un test de texte, sans rien analyser : appelé avant tout découpage pour que le chemin sans section
  // reste exactement celui d'avant.
  function hasSenses(source) {
    if (typeof source === 'string') return source.indexOf(ATTR) !== -1;
    return !!source && typeof source.querySelector === 'function' && !!source.querySelector('.' + START_CLASS + ', .page-break-marker[' + ATTR + ']');
  }

  // La page que dit une balise de repère (son texte `<div …>`), ou null sans sens lisible.
  function pageOfTag(tag) {
    const sense = new RegExp(ATTR + '="(' + PORTRAIT + '|' + LANDSCAPE + ')"').exec(tag);
    const format = new RegExp(FORMAT_ATTR + '="([^"]*)"').exec(tag);
    return sense ? { orientation: sense[1], format: format ? formatToken(format[1]) : null } : null;
  }

  // La page que dit le repère de départ d'un HTML assemblé (il ouvre le document : on ne cherche que dans son début), ou null. De quoi régler la page de départ
  // avant d'analyser le document, par exemple pour préparer l'en-tête et le pied dans la largeur de la première page.
  function firstPageOf(html) {
    const head = String(html || '').slice(0, 2000);
    const tag = new RegExp('<div\\b[^>]*\\bclass="[^"]*\\b' + START_CLASS + '\\b[^"]*"[^>]*>').exec(head);
    return tag ? pageOfTag(tag[0]) : null;
  }
  // Son sens seul, ou null.
  function firstSenseOf(html) {
    const page = firstPageOf(html);
    return page ? page.orientation : null;
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

  // Les pages employées par ce HTML, `{ orientation, format }` dans l'ordre où elles apparaissent (sans doublon) : un sens et un format (null : celui des marges) font une page. Ce que les
  // sorties qui préparent une variante par page (la plus grande feuille de l'impression, l'en-tête et le pied de chaque taille) lisent.
  function pagesIn(html) {
    const found = [];
    const pattern = new RegExp('<div\\b[^>]*\\b' + ATTR + '="(?:' + PORTRAIT + '|' + LANDSCAPE + ')"[^>]*>', 'g');
    let match = pattern.exec(String(html || ''));
    while (match) {
      const page = pageOfTag(match[0]);
      if (page && !found.some(other => samePage(other, page))) found.push(page);
      match = pattern.exec(String(html || ''));
    }
    return found;
  }

  const samePage = (a, b) => a.orientation === b.orientation && (a.format || null) === (b.format || null);

  // Les sections d'une suite de nœuds de premier niveau (leurs `childNodes`) : [{ orientation, format, nodes }], dans l'ordre du document. `base` : la page quand rien ne la dit encore
  // (un document sans repère de départ) - son sens, ou `{ orientation, format }` avec le format des marges : un repère qui n'a pas de format prend celui-là, si bien que `format` d'une
  // section est toujours un format quand `base` en a un (sans `base.format`, un repère sans format en laisse null). Le repère de départ n'entre dans aucune section : il a dit sa page
  // et n'a plus rien à montrer. Le saut de page qui ouvre une section reste son premier nœud (les sorties qui coupent les pages à partir des sauts le gardent ; la Lecture, dont chaque
  // section est une pile de feuilles, le retire). Une section peut n'avoir aucun nœud : un modèle vide ouvre quand même sa page.
  function split(nodes, base) {
    const origin = base && typeof base === 'object'
      ? { orientation: base.orientation === LANDSCAPE ? LANDSCAPE : PORTRAIT, format: formatToken(base.format) }
      : { orientation: base === LANDSCAPE ? LANDSCAPE : PORTRAIT, format: null };
    const sections = [];
    let current = null;
    let start = null;
    const markPage = el => {
      const page = pageOf(el);
      return page ? { orientation: page.orientation, format: page.format || origin.format } : null;
    };
    const open = page => { current = { orientation: page.orientation, format: page.format, nodes: [] }; sections.push(current); };
    Array.from(nodes || []).forEach(node => {
      if (isStart(node)) {
        start = markPage(node);
        // Des espaces devant le repère ont pu ouvrir la première section : elle prend sa page tant qu'aucun élément n'y est entré.
        if (current && start && !current.nodes.some(isElement)) { current.orientation = start.orientation; current.format = start.format; }
        return;
      }
      const page = isBreak(node) ? markPage(node) : null;
      if (!current) open(start || origin);
      if (page && !samePage(page, current)) open(page);
      current.nodes.push(node);
    });
    // Un repère de départ seul (modèle vide) : une section vide de cette page, pour que la première page la suive.
    if (!sections.length && start) sections.push({ orientation: start.orientation, format: start.format, nodes: [] });
    return sections;
  }

  // Le repère de départ, retiré de la racine : appelé par les sorties une fois son sens lu.
  function stripStart(root) {
    Array.from(root.childNodes).filter(isStart).forEach(node => root.removeChild(node));
  }

  return { ATTR, FORMAT_ATTR, ADDED_ATTR, START_CLASS, LANDSCAPE, PORTRAIT, senseOf, formatOf, pageOf, formatToken, attrsFor, isStart, isBreak, startHtml, hasSenses, firstPageOf, firstSenseOf, sensesIn, pagesIn, split, stripStart };
})();
