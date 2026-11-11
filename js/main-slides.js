// Les diapositives d'une présentation : la mise en page relancée quand les diapositives apparaissent (relayoutForSlides) et le câblage de l'entrée Diapositives (wireSlides). Sorti de js/main.js
// (refactorisation du 10/11, découpe 11) : `slidesRelayoutPending` est à lui ; le mode et le type du modèle y sont lus par des fonctions ; le reste lui est donné par `api`. Les corps sont ceux de main.js.
const MainSlides = (function () {
  function create(api) {
    const {
      applyPageFitZoomTo, editorContainer, getCurrentMode, getCurrentTypeModele, isReadOnly, readerContainer, renderReader, renderTemplateOptions, setStatus,
      startNewTemplate, templateSelect,
    } = api;

    // L'ajustement de la page se refait tout de suite ; la pagination de l'éditeur une seule fois, en fin de tâche, et pas du tout si une autre a eu lieu entre-temps : l'ouverture d'un
    // modèle montre la bande puis pagine elle-même, et une pagination coûte sur une présentation chargée (70 diapositives d'images : 0,3 s, mesure du 21/10).
    let slidesRelayoutPending = false;
    function relayoutForSlides() {
      const [readerChanged] = applyPageFitZoomTo(readerContainer, editorContainer);
      if (readerChanged && getCurrentMode() === 'read') renderReader();
      if (slidesRelayoutPending) return;
      slidesRelayoutPending = true;
      queueMicrotask(() => {
        if (!slidesRelayoutPending) return;
        slidesRelayoutPending = false;
        if (getCurrentMode() === 'edit') Editor.refreshPaginationPreview();
      });
    }

    // Les présentations (extension « diapositives », js/slides-entry.js) : « Nouvelle présentation » ouvre un modèle vierge de ce type par le chemin des autres « Nouveau… ». Quand GFS allume ou
    // éteint une extension (son contexte arrive au démarrage, ou la personne change d'avis), les modèles qui s'ouvrent ici changent : la liste se redessine tout de suite, en gardant le modèle
    // qu'elle montre (même au démarrage, quand l'ouverture vient de le choisir). La bande des diapositives apprend ce que l'écran montre, et quand elle prend ou rend sa place à gauche du
    // document, la page se réajuste à la largeur qui reste et sa pagination se refait (relayoutForSlides).
    function wireSlides() {
      SlidesEntry.setContext(() => ({ type: getCurrentTypeModele(), editing: getCurrentMode() === 'edit' && editorContainer.style.display !== 'none' && !isReadOnly() }));
      SlidesEntry.setHooks({ startNew: startNewTemplate, relayout: relayoutForSlides, status: (msg, isError) => setStatus(msg, !!isError) });
      HeaderFooterPreview.onPaginated(() => { slidesRelayoutPending = false; });
      SlidesEntry.onChange(() => {
        const shown = templateSelect.value;
        renderTemplateOptions(Templates.getCached());
        templateSelect.value = shown;
      });
    }

    // La diapositive où l'on est, gardée d'un mode à l'autre (demande du 11/11 : « quand on passe en mode lecture, aller à la diapo où l'on était et pas au début ») : en passant de l'Édition à la Lecture d'une
    // présentation, la Lecture s'ouvre sur la diapositive de l'éditeur ; en revenant, l'éditeur retrouve celle qu'on lisait. `slideToKeep(versMode)` se lit AVANT que l'écran change (l'éditeur ou la Lecture est encore à
    // mesurer) et rend son rang, ou -1 (autre type de modèle, même mode, rien à mesurer) ; `keepSlide(versMode, rang)` la montre une fois le nouvel écran posé et rendu. Rien d'autre ne change pour un document.
    function slideToKeep(toMode) {
      const from = getCurrentMode();
      if (toMode === from || !SlidesEntry.isPresentation(getCurrentTypeModele())) return -1;
      if (from === 'edit' && toMode === 'read') return SlidesEntry.shownSlide();
      if (from === 'read' && toMode === 'edit') return ReaderMode.slideShown();
      return -1;
    }
    function keepSlide(toMode, index) {
      if (!(index >= 0)) return false;
      return toMode === 'read' ? ReaderMode.showSlide(index) : SlidesEntry.showSlide(index);
    }

    return { wireSlides, slideToKeep, keepSlide };
  }

  return { create };
})();
