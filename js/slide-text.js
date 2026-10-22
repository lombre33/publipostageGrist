// Une diapositive en texte de document (demande du 22/10 : « importer des slide dans des documents » ; cartes « En texte, dans les deux sens » et « Celle d'arrivée, avec une case »). Le socle
// garde ici la conversion, seule, sans le code de l'extension « diapositives » : un document qui reçoit une diapositive copiée dans une présentation (Ctrl+V, même d'un autre onglet) doit
// pouvoir la convertir sans charger la bande ; le volet de la ligne « Diapositive d'une présentation… » du menu « Lien et blocs de contenu » (extensions/diapositives/slide-import.js)
// appelle la même fonction. js/slides-entry.js est le seul point d'entrée du reste du widget.
//  - LE TEXTE de la diapositive devient du texte du document, à la taille du document (la case « Garder la mise en forme d'origine » garde les tailles de la diapositive : 20 pt, titres à 44 pt…) :
//    les tailles d'une diapositive sont des marques de texte (js/slides-entry.js : TEXT_SIZE, HEADING_SIZES), retirées ; le reste de la mise en forme (gras, couleur, listes, tableaux, images, variables)
//    est gardé tel quel, et les variables se fusionnent avec les données du document sans traitement.
//  - LES CADRES LIBRES (js/free-frame.js) perdent leur place sur la page : le texte courant de la diapositive d'abord, puis celui de chaque cadre dans l'ordre de lecture (de haut en bas, de gauche à
//    droite à la même hauteur). Une forme garde son texte, mais pas son dessin ; un trait n'a pas de texte.
//  - LES IMAGES posées devant ou derrière le texte deviennent des images du texte, à leur place dans le paragraphe qui les porte : leur page, leur position et « Sur toutes les pages » n'ont pas de sens
//    dans un document.
//  - CE QUI N'ENTRE PAS est compté et dit à la personne (report) : les formes, les traits, les notes de l'intervenant, la transition et le fond de la diapositive (js/slide-props.js). Le repère d'une
//    diapositive liée (js/slide-links.js) ne passe jamais. Plusieurs diapositives copiées ensemble se suivent, sans le saut de page qui les séparait.
//  - LE CURSEUR se pose après le texte, au début du bloc qui suit (un second import se pose donc après le premier). Quand la diapositive finit par une liste et que rien ne suit, ProseMirror le
//    laisse dans le dernier élément de la liste, où la diapositive suivante s'imbriquerait : leaveBlockAtEnd le passe au paragraphe vide que l'éditeur ajoute à la fin du document.
// Ces conversions travaillent sur un document inerte (HtmlSanitize.parseInert) : rien ne s'y charge ni ne s'y exécute.
const SlideText = (function () {
  const FRAME = 'div.pp-free-frame';
  const FRAME_CONTENT = '.pp-free-frame-content';
  const BACKGROUND_ATTR = 'data-ff-bg';
  const PROPS = 'div.pp-slide-props';
  const BREAK_CLASS = 'page-break-marker';
  const LAYERED = 'img.editor-image[data-layer="front"], img.editor-image[data-layer="behind"]';
  const LAYER_ATTRS = ['data-page-index', 'data-page-left-pt', 'data-page-top-pt', 'data-repeat'];
  const LAYER_STYLE = ['position', 'left', 'top', 'z-index'];
  // Deux cadres dont le haut est à moins de cette distance (en points) sont sur la même ligne : celui de gauche se lit d'abord.
  const SAME_ROW_PT = 12;
  // L'enveloppe du HTML d'une diapositive copiée (js/slide-strip.js:slideForClipboard, extensions/diapositives/) : la même expression, lue au début du presse-papiers seulement.
  const ENVELOPE = /<div\b[^>]*\sdata-pp-slide(?:="(\d*)")?(?=[\s/>])/i;
  const ENVELOPE_CHARS = 4096;
  // Le HTML d'un collage de ProseMirror qui dit « une tranche fermée » : ses blocs se posent entiers (un titre ne se fond pas dans le paragraphe du curseur, un paragraphe vide est remplacé).
  const SLICE_ATTR = 'data-pm-slice';
  const CLOSED_SLICE = '0 0 []';

  const numberOf = (el, name) => { const value = parseFloat(el.getAttribute(name)); return Number.isFinite(value) ? value : 0; };
  // Un bloc sans rien dedans : un paragraphe vide (un saut de ligne au plus).
  const isBlank = node => node.nodeType === Node.TEXT_NODE ? !node.nodeValue.trim()
    : node.nodeType !== Node.ELEMENT_NODE || (node.tagName === 'P' && !node.textContent.trim() && !node.querySelector('*:not(br)'));

  // Les cadres d'une diapositive dans l'ordre de lecture.
  function readingOrder(frames) {
    const placed = frames.map(frame => ({ frame, x: numberOf(frame, 'data-ff-x'), y: numberOf(frame, 'data-ff-y') })).sort((a, b) => a.y - b.y);
    const rows = [];
    placed.forEach((item) => {
      const row = rows[rows.length - 1];
      if (row && item.y - row[0].y < SAME_ROW_PT) row.push(item); else rows.push([item]);
    });
    return rows.flatMap(row => row.sort((a, b) => a.x - b.x)).map(item => item.frame);
  }

  // Les diapositives de `holder`, séparées par leurs sauts de page : la liste des nœuds de chacune.
  function split(holder) {
    const slides = [[]];
    Array.from(holder.childNodes).forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains(BREAK_CLASS)) { slides.push([]); return; }
      if (node.nodeType === Node.TEXT_NODE && !node.nodeValue.trim()) return;
      slides[slides.length - 1].push(node);
    });
    return slides;
  }

  // Le repère d'une diapositive : ce qu'il dit (transition, fond, notes) ne peut pas passer dans un document, et se compte.
  function countProps(marker, dropped) {
    if (marker.getAttribute('data-trans')) dropped.transition++;
    if (marker.getAttribute('data-bg')) dropped.background++;
    if ((marker.getAttribute('data-notes') || '').trim()) dropped.notes++;
  }

  // Les nœuds de texte d'une diapositive : son texte courant, puis celui de ses cadres.
  function textOf(nodes, dropped) {
    const out = [];
    const frames = [];
    nodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches(PROPS)) { countProps(node, dropped); return; }
        if (node.matches('div.' + SlideLinks.CLASS)) return;
        if (node.matches(FRAME)) { frames.push(node); return; }
      }
      out.push(node);
    });
    readingOrder(frames).forEach((frame) => {
      if (frame.hasAttribute(BACKGROUND_ATTR)) return;
      const shape = frame.getAttribute('data-ff-shape') || '';
      if (shape === ShapeGeometry.LINE) { dropped.lines++; return; }
      if (shape) dropped.shapes++;
      const content = frame.querySelector(FRAME_CONTENT);
      const blocks = content ? Array.from(content.childNodes) : [];
      if (!blocks.every(isBlank)) out.push(...blocks);
    });
    return out;
  }

  // Une image devant ou derrière le texte devient une image du texte.
  function inlineLayers(root) {
    root.querySelectorAll(LAYERED).forEach((img) => {
      img.setAttribute('data-layer', 'normal');
      img.setAttribute('data-wrap', 'inline');
      LAYER_ATTRS.forEach(name => img.removeAttribute(name));
      LAYER_STYLE.forEach(name => img.style.removeProperty(name));
      if (!img.getAttribute('style')) img.removeAttribute('style');
    });
  }
  // Les tailles de texte de la diapositive (marques `fontSize`) : retirées, le texte prend celles du document ; un <span> qui n'avait que la taille disparaît.
  function dropSizes(root) {
    root.querySelectorAll('[style]').forEach((node) => {
      if (!node.style.fontSize) return;
      node.style.removeProperty('font-size');
      if (!node.getAttribute('style').trim()) node.removeAttribute('style');
      if (node.tagName === 'SPAN' && !node.attributes.length) node.replaceWith(...node.childNodes);
    });
  }

  // Convertit en place les diapositives que contient `holder` (un élément d'un document inerte) en texte de document. `keepFormat` : garde les tailles de la diapositive. Rend
  // { slides, dropped, blank } : le nombre de diapositives, ce qui n'est pas entré ({ shapes, lines, notes, transition, background }), et si rien de lisible n'en reste.
  function toDocument(holder, { keepFormat = false } = {}) {
    const dropped = { shapes: 0, lines: 0, notes: 0, transition: 0, background: 0 };
    const slides = split(holder);
    const nodes = slides.flatMap(slide => textOf(slide, dropped));
    holder.replaceChildren(...nodes);
    inlineLayers(holder);
    if (!keepFormat) dropSizes(holder);
    // La tranche est « fermée » : ses blocs se posent entiers, là où est le curseur.
    holder.querySelectorAll('[' + SLICE_ATTR + ']').forEach(el => el.removeAttribute(SLICE_ATTR));
    const first = holder.firstElementChild;
    if (first) first.setAttribute(SLICE_ATTR, CLOSED_SLICE);
    return { slides: slides.length, dropped, blank: nodes.every(isBlank) };
  }

  // Le HTML d'une diapositive copiée de la bande (enveloppe `data-pp-slide`) devenu texte de document : { html, slides, dropped, blank }, ou null quand `html` n'en est pas une.
  function pasted(html, options) {
    if (typeof html !== 'string' || !ENVELOPE.test(html.slice(0, ENVELOPE_CHARS))) return null;
    const body = HtmlSanitize.parseInert(html);
    const holder = body.querySelector('[data-pp-slide]');
    if (!holder) return null;
    const result = toDocument(holder, options);
    return Object.assign(result, { html: holder.innerHTML });
  }

  // Une insertion qui finit le document par une liste ou un tableau : rien ne la suit encore quand la sélection se pose (le paragraphe vide qui termine le document vient après), elle reste donc
  // au bout du dernier élément, où la diapositive suivante se glisserait. Le curseur passe à ce paragraphe vide. Ailleurs (un bloc suit l'insertion, ou elle finit par un paragraphe), rien ne change.
  function leaveBlockAtEnd(view) {
    const { state } = view;
    const { $to } = state.selection;
    if ($to.depth < 2 || $to.end(1) - $to.pos !== $to.depth - 1) return;
    const next = state.doc.maybeChild($to.index(0) + 1);
    if (!next || !next.isTextblock) return;
    view.dispatch(state.tr.setSelection(EditorCore.getTextSelectionClass().near(state.doc.resolve($to.after(1)), 1)));
  }

  // Ce qui n'est pas entré, en une phrase de la langue de l'interface : « 2 éléments non repris : 1 forme, 1 transition. » ; '' quand tout est entré.
  function report(dropped) {
    const parts = ['shapes', 'lines', 'notes', 'transition', 'background'].filter(key => dropped[key] > 0)
      .map(key => I18n.t('slides.text.drop.' + key, { n: dropped[key] }));
    const total = Object.keys(dropped).reduce((sum, key) => sum + dropped[key], 0);
    return parts.length ? I18n.t('slides.text.dropped', { n: total, list: parts.join(', ') }) : '';
  }

  return { toDocument, pasted, report, leaveBlockAtEnd };
})();
