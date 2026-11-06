// Rechercher / Remplacer dans l'éditeur : un panneau fin entre la barre d'outils et le texte, jamais une fenêtre, pour que le modèle reste visible et
// modifiable pendant qu'on cherche.
//  - Rechercher : tous les résultats surlignés (au-delà de 500, ceux de l'écran et de ses abords), le courant plus marqué, « 3 sur 12 », précédent
//    / suivant (Entrée, Maj+Entrée), « Respecter la casse », « Mot entier » et « Expression régulière » (le motif est celui de JavaScript, il
//    ne traverse ni une bulle ni une suppression suivie ; « $1 », « $& » et « $<nom> » reprennent un groupe dans le remplacement) ;
//  - Remplacer : « Remplacer » remplace le résultat courant puis passe au suivant, « Tout remplacer » les remplace tous. Un remplacement est une
//    transaction ProseMirror (une seule étape d'annulation, « Tout remplacer » compris) qui garde la mise en forme du texte remplacé et passe par le
//    mode suivi quand il est actif : l'ancien texte devient une suppression suggérée, le nouveau une insertion suggérée (js/track-changes.js ;
//    skipTracking est l'inverse, pour ce que le widget écrit seul) ;
//    Annuler défait le texte ouvert (le corps, l'en-tête et le pied ont chacun leur historique), sauf juste après un « Remplacer » qui a fait passer
//    la recherche à un autre texte : Annuler rouvre d'abord le texte du remplacement, puis le défait (reopenForUndo) ;
//  - ouverture : Ctrl+F / ⌘F (rechercher) et Ctrl+H / ⌘⇧H (remplacer), même quand le clavier est resté sur un bouton de la barre d'outils, tant que
//    l'éditeur est à l'écran et qu'aucune fenêtre n'est ouverte (sinon la recherche du navigateur reprend la main) ; la loupe de la barre fait de
//    même. Échap ferme et rend le clavier à l'éditeur, le dernier résultat reste sélectionné (on peut taper par-dessus).
// Ce fichier est la façade que le reste du widget appelle (FindReplace.open, .next, .createExtension…) ; le travail est fait par quatre morceaux, chargés avant lui :
// js/find-replace-engine.js (le moteur : un document ProseMirror, une requête, des options, sans interface, il se teste seul), js/find-replace-view.js (l'état de la
// recherche et le surlignage), js/find-replace-actions.js (aller de l'un à l'autre, remplacer) et js/find-replace-panel.js (le panneau). L'état de la recherche vit dans
// FindReplaceView, pas dans le plugin ProseMirror : un changement de modèle reconstruit l'état de l'éditeur (Editor.setHTML) et remettrait sinon la recherche à zéro
// sous le panneau resté ouvert. Styles : css/find-replace.css.
const FindReplace = (function () {
  const { findMatches, isBubble } = FindReplaceEngine;
  const { state, createExtension } = FindReplaceView;
  const { go, applyQuery, replaceCurrent, replaceAll } = FindReplaceActions;
  const { open, closePanel, toggleOpen, wireEditor, syncOptions, queryError, showQuery, showReplacement } = FindReplacePanel;

  return {
    findMatches, isBubble, createExtension, wireEditor, open, close: closePanel, toggle: toggleOpen,
    isOpen: () => state.open, queryError,
    next: () => go(false), prev: () => go(true), replaceCurrent, replaceAll,
    setQuery(query) { state.query = String(query == null ? '' : query); showQuery(); applyQuery(); },
    setOptions(options) {
      if (options && options.matchCase !== undefined) state.matchCase = !!options.matchCase;
      if (options && options.wholeWord !== undefined) state.wholeWord = !!options.wholeWord;
      if (options && options.regex !== undefined) state.regex = !!options.regex;
      syncOptions();
      applyQuery();
    },
    setReplacement(text) { state.replacement = String(text == null ? '' : text); showReplacement(); },
  };
})();
