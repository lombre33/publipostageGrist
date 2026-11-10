// L'ajustement de la page à la largeur disponible (`--pp-fit-zoom`) : le calcul en deux temps (lire, puis écrire) pour l'éditeur et la Lecture, et le câblage qui le refait quand le conteneur change de taille.
// Sorti de js/main.js (refactorisation du 10/11, découpe 9) : le mode y est lu par une fonction ; le reste lui est donné par `api`. Les corps sont ceux de main.js.
const MainPageZoom = (function () {
  function create(api) {
    const { editorContainer, getCurrentMode, readerContainer, renderReader, templateNameInput } = api;

    // Ajustement de la page à la largeur disponible (cf. la règle `zoom` de css/editor-v2.css) : réduit la feuille juste ce qu'il faut pour
    // qu'elle tienne dans le conteneur, jamais au-delà de 1 (une page A4 n'a pas à grossir sur un grand écran) et jamais en dessous de 0,5,
    // sous lequel le texte deviendrait illisible ; le défilement horizontal reprend alors la main. Quand la feuille tient déjà, le facteur vaut 1 et
    // rien ne change. C'est l'affichage d'origine : js/page-zoom.js (factorFor) calcule ce facteur et le remplace par le niveau que la personne a
    // choisi (pastille de zoom, Ctrl + molette, « Ajuster »), le même pour l'éditeur et la Lecture.
    // Deux temps, comme tout ce qui lit la mise en page puis la change : `planPageFitZoom` LIT (le facteur, et l'écart de hauteur des lignes de tableau que mesure la sonde de js/page-zoom.js),
    // `commitPageFitZoom` ÉCRIT. Posé d'abord, le facteur obligeait la sonde à faire refaire le style de tout le document pour le lire (0,2 s sur une présentation de 39 diapositives), puis la
    // variable de l'écart (`--pp-row-grow`) le faisait refaire une seconde fois ; et le conteneur suivant, lu après l'écriture du premier, payait encore ce que celui-là venait de défaire.
    // La sonde est posée dans `body` : son résultat ne dépend que du facteur, jamais de l'état du document, qu'elle lise avant ou après.
    function planPageFitZoom(container) {
      if (!container) return null;
      if (!container.classList.contains('a4-preview')) return { container, reset: true };
      const zoom = PageZoom.factorFor(container);
      if (zoom == null) return null;
      // Arrondi au millième : sans ça, un redimensionnement continu réécrit la variable à chaque pixel et relance la pagination en boucle.
      const next = String(Math.round(zoom * 1000) / 1000);
      // L'écart de hauteur des lignes de tableau sous ce facteur (js/page-zoom.js:rowGrow) suit le facteur, et la densité de pixels de l'écran, qui peut changer seule : mesuré ici, gardé en mémoire
      // pour `syncRowGrow` de l'écriture.
      if (Number(next) > 0 && Number(next) !== 1) PageZoom.rowGrow(Number(next));
      return { container, next };
    }
    function commitPageFitZoom(plan) {
      if (!plan) return undefined;
      const { container } = plan;
      if (plan.reset) { container.style.removeProperty('--pp-fit-zoom'); PageZoom.syncRowGrow(container, 0); return undefined; }
      const changed = container.style.getPropertyValue('--pp-fit-zoom') !== plan.next;
      if (changed) container.style.setProperty('--pp-fit-zoom', plan.next);
      return PageZoom.syncRowGrow(container, Number(plan.next)) || changed || undefined;
    }
    // Un seul conteneur (l'entrée en Lecture) : lit, puis écrit. Rend true quand le facteur ou l'écart de lignes a changé.
    function applyPageFitZoom(container) {
      return commitPageFitZoom(planPageFitZoom(container));
    }
    // Les deux conteneurs d'un coup : tout se lit, puis tout s'écrit, dans l'ordre donné. Rend, dans le même ordre, ce que chaque écriture dit (true quand le conteneur a changé).
    function applyPageFitZoomTo(first, second) {
      const plans = [planPageFitZoom(first), planPageFitZoom(second)];
      return [commitPageFitZoom(plans[0]), commitPageFitZoom(plans[1])];
    }

    // Pose le facteur sur les deux conteneurs sans rien rafraîchir, pour les appelants qui rafraîchissent eux-mêmes juste après (chargement d'un
    // modèle, changement d'orientation). Rend true si l'un des deux a changé.
    function applyPageFitZoomToBoth() {
      const [editorChanged, readerChanged] = applyPageFitZoomTo(editorContainer, readerContainer);
      return !!(editorChanged || readerChanged);
    }

    function refreshPageFitZoom() {
      const [editorChanged, readerChanged] = applyPageFitZoomTo(editorContainer, readerContainer);
      // Les bandes de pagination sont positionnées à partir de mesures réelles : un changement de facteur les rend caduques tant qu'on n'a pas
      // recalculé.
      if (editorChanged && getCurrentMode() === 'edit') Editor.refreshPaginationPreview();
      if (readerChanged && getCurrentMode() === 'read') renderReader();
    }

    function wirePageFitZoom() {
      // La pastille de zoom (js/page-zoom.js) change le facteur sans que le conteneur change de taille : les bandes de pagination, mesurées sur l'ancien
      // rendu, se refont ici - celles de l'éditeur, ou la Lecture.
      PageZoom.wire({
        apply: applyPageFitZoomToBoth,
        refresh: () => (getCurrentMode() === 'read' ? renderReader() : Editor.refreshPaginationPreview()),
        template: () => ({ id: Templates.getCurrentId(), name: templateNameInput ? templateNameInput.value.trim() : '' }),
      });
      refreshPageFitZoom();
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => refreshPageFitZoom());
        if (editorContainer) ro.observe(editorContainer);
        if (readerContainer) ro.observe(readerContainer);
      } else {
        window.addEventListener('resize', refreshPageFitZoom);
      }
    }

    return { applyPageFitZoom, applyPageFitZoomTo, applyPageFitZoomToBoth, refreshPageFitZoom, wirePageFitZoom };
  }

  return { create };
})();
