// Les repères de la ZONE répétée d'une boucle (ligne de tableau, élément de liste, paragraphe ou titre teintés, avec leur onglet dans la marge) sont une feuille de style à part, css/loop-marks.css,
// liée dans index.html avec `media="not all"` : tant qu'aucune boucle n'est dans le document, elle ne compte pour rien. Ses sélecteurs `:has()` (« ce paragraphe contient une bulle en boucle ») ont
// un prix qui grossit avec le document : le moteur doit revoir leurs ancres - chaque paragraphe, chaque ligne, le texte entier - à chaque insertion, et dans une présentation importée, où des
// dizaines de milliers de cadres sont frères dans un seul texte, le recalcul des styles d'UNE diapositive posée passait de 75 ms à la dixième à 363 ms à la quarantième (10/11, trace du
// navigateur : 42 s de pose pour 120 diapositives de schémas, 26 s sans ces règles). Un document sans boucle - presque tous, et toute présentation - ne les paie plus.
//
// `need()` : à appeler là où l'attribut `data-loop-repeat` entre dans le document (js/editor-nodes.js : la bulle, le cadre d'une image de colonne) ; la feuille s'active à cet instant, avant
// que le navigateur ne calcule les styles de ce qui vient d'être écrit, si bien que rien ne se voit autrement. `reset()` : Editor.setHTML l'appelle avant de charger un autre texte (la feuille
// se réactive pendant la pose si ce texte a une boucle ; remise à `all` dans la même tâche, le navigateur ne voit aucun changement).
const LoopMarks = (function () {
  const SHEET_ID = 'pp-loop-marks-css';
  let active = false;

  function setMedia(media) {
    const link = document.getElementById(SHEET_ID);
    if (link && link.media !== media) link.media = media;
  }
  function need() {
    if (active) return;
    active = true;
    setMedia('all');
  }
  function reset() {
    if (!active) return;
    active = false;
    setMedia('not all');
  }
  const isActive = () => active;

  return { need, reset, isActive };
})();
