// Les pages tournées d'un document, dans l'éditeur (demande du 22/10 : « une page en paysage et les autres en portrait »). Le document le dit lui-même (js/page-sections.js) : un saut de page
// qui porte `data-page-orientation` donne ce sens aux pages qui le suivent, la première page a celui des marges (PageLayout.getOrientation). L'éditeur n'a qu'UNE colonne de texte
// (`.tiptap`), qui ne change pas de largeur d'une page à l'autre ; ce module dit comment elle montre quand même des pages de deux largeurs :
//  - la feuille (`.v2-page-sheet`) prend la largeur de la plus large de ses pages, devient transparente (classe `pp-mixed-pages` sur #editor-container) et chaque page y est un papier à sa
//    taille (js/header-footer-preview.js:paintPapers) ;
//  - les blocs d'une page plus étroite (le portrait, à côté d'une page paysage) sont rentrés du même écart de chaque côté (`--pp-sec-gap`), par une décoration de classe `pp-sec-narrow` :
//    rien dans le document ni dans le HTML enregistré. Leur texte se répartit dans la largeur utile de SA page, comme dans le PDF, le Word, la Lecture et l'impression ;
//  - le zoom de la feuille se règle sur la plus large (`data-pp-widest-sheet`, que js/page-zoom.js lit déjà pour la Lecture d'un macro-modèle aux sens mêlés).
// Un saut de page tourné ferme la page qui le précède : il garde le sens de cette page (c'est elle qui le porte à l'écran), ce qui le suit prend le sien. Sans saut tourné qui change le sens, ou
// avec des pages d'un seul sens, rien de tout cela n'existe : l'éditeur est exactement celui d'avant.
const PageSectionView = (function () {
  const NARROW_CLASS = 'pp-sec-narrow';
  const MIXED_CLASS = 'pp-mixed-pages';
  const WIDEST_ATTR = 'data-pp-widest-sheet';
  const GAP_VAR = '--pp-sec-gap';
  const SHEET_VAR = '--pp-mixed-sheet-width';
  const PORTRAIT = PageSections.PORTRAIT;
  const LANDSCAPE = PageSections.LANDSCAPE;
  const normal = sense => (sense === LANDSCAPE ? LANDSCAPE : PORTRAIT);

  // Le sens où tombe chaque bloc de premier niveau, dans l'ordre du document. `turns[i]` : le sens que le bloc i ouvre pour ce qui le suit (un saut de page tourné), null pour tout autre bloc.
  function sensesOf(turns, base) {
    let current = normal(base);
    return turns.map(turn => {
      const here = current;
      if (turn) current = normal(turn);
      return here;
    });
  }

  // La largeur de la feuille d'un sens, au format et aux marges du document (PageLayout.withOrientation ne touche à rien : il prête le sens le temps du calcul).
  const sheetWidthPx = sense => PageLayout.withOrientation(sense, () => PageLayout.getSheetWidthPx());
  const pageHeightPx = sense => PageLayout.withOrientation(sense, () => PageLayout.getPageSizePx().height);

  // Ce que ces sens demandent à la feuille, ou null quand il n'y a qu'un sens (rien ne change alors). L'écart d'un sens est ce qui manque à sa page pour remplir la feuille, de chaque côté.
  function summarize(senses) {
    if (senses.indexOf(PORTRAIT) === -1 || senses.indexOf(LANDSCAPE) === -1) return null;
    const sheetPx = { portrait: sheetWidthPx(PORTRAIT), landscape: sheetWidthPx(LANDSCAPE) };
    const widestPx = Math.max(sheetPx.portrait, sheetPx.landscape);
    const gapOf = sense => Math.round((widestPx - sheetPx[sense]) / 2 * 100) / 100;
    return { widestPx, sheetPx, gapPx: { portrait: gapOf(PORTRAIT), landscape: gapOf(LANDSCAPE) } };
  }
  const narrowGap = summary => (summary ? Math.max(summary.gapPx.portrait, summary.gapPx.landscape) : 0);

  // --- Ce que l'éditeur lit sur son DOM (pagination) ---
  const turnOfEl = el => (PageSections.isBreak(el) ? PageSections.senseOf(el) : null);
  // Les pages tournées de ce `.tiptap`, ou null quand ses pages n'ont qu'un sens. `senses[i]` : le sens du i-ième enfant.
  function read(tiptapEl) {
    const children = Array.from(tiptapEl.children);
    const turns = children.map(turnOfEl);
    if (!turns.some(Boolean)) return null;
    const senses = sensesOf(turns, PageLayout.getOrientation());
    const summary = summarize(senses);
    return summary && Object.assign({ senses }, summary);
  }
  // Le sens de chaque page de la pagination (`breaks` de HeaderFooterPreview.computePageBreaks) : la première a celui des marges, une coupure forcée sur un saut de page tourné ouvre une page de son
  // sens, toute autre coupure garde celui de la page qui finit.
  function pageSenses(breaks) {
    const senses = [normal(PageLayout.getOrientation())];
    breaks.forEach(brk => {
      const turn = brk.forced && brk.rowIndex == null && !brk.zone && brk.afterEl ? turnOfEl(brk.afterEl) : null;
      senses.push(turn ? normal(turn) : senses[senses.length - 1]);
    });
    return senses;
  }

  // --- Le conteneur ---
  const containerOf = view => (view && view.dom && view.dom.closest ? view.dom.closest('#editor-container') : null) || document.getElementById('editor-container');
  // La feuille la plus large, et l'écart des pages étroites, posés sur le conteneur ; le facteur d'ajustement suit (la même mise à jour que js/reader-mode.js:syncWidestSheet : la pagination se
  // mesure à ce facteur, un facteur changé après elle la rendrait caduque).
  function applyTo(container, summary) {
    if (!container) return false;
    const mixed = !!summary;
    const widest = mixed ? String(summary.widestPx) : '';
    const gap = mixed ? narrowGap(summary) + 'px' : '';
    const same = container.classList.contains(MIXED_CLASS) === mixed && (container.getAttribute(WIDEST_ATTR) || '') === widest && container.style.getPropertyValue(GAP_VAR) === gap;
    if (same) return false;
    container.classList.toggle(MIXED_CLASS, mixed);
    if (mixed) {
      container.setAttribute(WIDEST_ATTR, widest);
      container.style.setProperty(GAP_VAR, gap);
      container.style.setProperty(SHEET_VAR, widest + 'px');
    } else {
      container.removeAttribute(WIDEST_ATTR);
      container.style.removeProperty(GAP_VAR);
      container.style.removeProperty(SHEET_VAR);
    }
    if (container.classList.contains('a4-preview')) {
      const zoom = PageZoom.factorFor(container);
      if (zoom != null) container.style.setProperty('--pp-fit-zoom', String(Math.round(zoom * 1000) / 1000));
    }
    return true;
  }

  // --- La décoration ---
  let pm = null; // { Plugin, PluginKey, Decoration, DecorationSet } de ProseMirror, fournis par js/editor.js
  const turnOfNode = node => (node.type.name === 'pageBreak' && node.attrs.orientation ? normal(node.attrs.orientation) : null);
  // Les blocs de premier niveau du document, leur sens, et la décoration qui rentre ceux d'une page plus étroite. `summary` nul : un seul sens, aucune décoration.
  function scan(doc, base) {
    const blocks = [];
    const turns = [];
    doc.forEach((node, offset) => { blocks.push({ node, offset }); turns.push(turnOfNode(node)); });
    if (!turns.some(Boolean)) return { summary: null, decorations: pm.DecorationSet.empty };
    const senses = sensesOf(turns, base);
    const summary = summarize(senses);
    if (!summary) return { summary: null, decorations: pm.DecorationSet.empty };
    const decorations = [];
    blocks.forEach(({ node, offset }, index) => {
      if (summary.gapPx[senses[index]] > 0) decorations.push(pm.Decoration.node(offset, offset + node.nodeSize, { class: NARROW_CLASS }));
    });
    return { summary, decorations: decorations.length ? pm.DecorationSet.create(doc, decorations) : pm.DecorationSet.empty };
  }

  let currentView = null;
  // Le sens des marges ou le format a changé sans que le document change : les décorations et le conteneur se relisent, sans transaction (rien dans l'historique, rien à enregistrer). Posé avant
  // l'écouteur de js/main.js (ce script se charge avant lui) : la pagination qu'il lance mesure déjà la feuille à jour.
  document.addEventListener('pp:pageLayoutChanged', () => { if (currentView && !currentView.isDestroyed) currentView.setProps({}); });

  function createExtension(Extension, libs) {
    pm = libs;
    const { Plugin, PluginKey } = libs;
    return Extension.create({
      name: 'pageSections',
      addProseMirrorPlugins() {
        let cached = { doc: null, base: null, result: null };
        const resultFor = state => {
          const base = normal(PageLayout.getOrientation());
          if (cached.doc !== state.doc || cached.base !== base) cached = { doc: state.doc, base, result: scan(state.doc, base) };
          return cached.result;
        };
        return [new Plugin({
          key: new PluginKey('pageSections'),
          props: { decorations: state => resultFor(state).decorations },
          view(view) {
            currentView = view;
            applyTo(containerOf(view), resultFor(view.state).summary);
            return {
              update(updatedView) { applyTo(containerOf(updatedView), resultFor(updatedView.state).summary); },
              destroy() { if (currentView === view) currentView = null; applyTo(containerOf(view), null); },
            };
          },
        })];
      },
    });
  }

  // L'écart que les pages étroites laissent de chaque côté de leur texte (pixels de mise en page), 0 quand la feuille n'a qu'une largeur.
  function gapPx() {
    const container = document.getElementById('editor-container');
    return container ? parseFloat(container.style.getPropertyValue(GAP_VAR)) || 0 : 0;
  }
  // Le bloc de premier niveau de `.tiptap` qui contient `el` est-il d'une page plus étroite ? Son écart sinon 0 : de quoi retrancher de la largeur utile d'un tableau, d'une image ou d'une grille.
  function gapAt(el) {
    const block = el && el.closest ? el.closest('.tiptap > *') : null;
    return block && block.classList.contains(NARROW_CLASS) ? gapPx() : 0;
  }

  // Le décalage qu'une image en calque de ce bloc reçoit de la feuille (sa marge gauche, css/editor-v2.css) : celui de son bloc, sauf dans une case, une zone ou un encadré, dont le parent
  // positionné s'est déjà rentré avec son bloc. Son `left` enregistré, lui, reste compté depuis le coin de SA page : ce qui se lit sur l'écran (un rectangle, `offsetLeft`) s'en retranche.
  function layerGapAt(el) {
    const gap = gapAt(el);
    return gap && !el.closest('td, th, .two-columns-zone-outer, .callout') ? gap : 0;
  }

  // Le sens de la page où tombe `el` (le bloc de premier niveau qui le contient), ou null quand le document n'a qu'un sens : ses réglages sont alors ceux du document, rien à lire de plus.
  function senseAt(el) {
    const block = el && el.closest ? el.closest('.tiptap > *') : null;
    if (!block) return null;
    const mixed = read(block.parentElement);
    return mixed ? mixed.senses[Array.prototype.indexOf.call(block.parentElement.children, block)] || null : null;
  }
  // La largeur du texte de la page où tombe `el`, en mm : celle des marges du document pour la plupart des documents, celle de SA page quand il a des pages de deux sens.
  function contentWidthMmAt(el) {
    const sense = senseAt(el);
    return sense ? PageLayout.withOrientation(sense, () => PageLayout.getContentWidthMm()) : PageLayout.getContentWidthMm();
  }

  return { NARROW_CLASS, MIXED_CLASS, createExtension, read, pageSenses, sheetWidthPx, pageHeightPx, gapAt, gapPx, layerGapAt, senseAt, contentWidthMmAt };
})();
