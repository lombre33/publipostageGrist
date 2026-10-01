// « Sur toutes les pages » (Antoine, 01/10, la Fiche mission : un triangle bleu dans le coin de chaque feuille) : une image en calque « derrière le texte » dont la case est
// cochée (`data-repeat="true"`) est peinte à la MÊME place de CHAQUE page, dans l'éditeur, la Lecture, le PDF et le Word.
//
// Ce module est la couche de page : ce que les quatre rendus ont en commun (quelle image en fait partie, et à quelle place de la page), jamais ce que chacun en fait - le PDF
// la peint en fond de chaque page (js/pdf-export.js), le Word l'ancre dans l'en-tête (js/docx-export.js), l'éditeur et la Lecture la dessinent sur chaque feuille. Le filigrane
// (Paysage et portrait, roadmap n° 14) s'appuiera dessus : une couche, pas deux.
//
// La place est celle de la grille page que l'éditeur capture à chaque positionnement de l'image (data-page-index / data-page-left-pt / data-page-top-pt) : en points depuis le
// coin haut gauche du CONTENU de la page (marges et bande d'en-tête comprises, cf. computePageGridPosition, js/header-footer-preview.js). Une image qui n'a pas cette grille
// (document ancien, jamais positionné dans l'Aperçu A4) n'est jamais répétée : sans place connue, il n'y a rien à reproduire.
const PageLayer = (function () {
  const SELECTOR = 'img.editor-image[data-layer="behind"][data-repeat="true"]';
  const finite = value => typeof value === 'number' && isFinite(value);

  // Attributs d'un nœud `editorImage` (ProseMirror) : la case n'a de sens que derrière le texte, et que si la place de la page est connue.
  function isRepeatedAttrs(attrs) {
    return !!attrs && attrs.layer === 'behind' && attrs.repeat === true && finite(attrs.pageIndex) && finite(attrs.pageLeftPt) && finite(attrs.pageTopPt);
  }

  // Grille page d'un <img> du DOM (éditeur, Lecture, HTML d'export) : { pageIndex, leftPt, topPt }, ou null quand elle manque.
  function gridOfEl(img) {
    if (!img || !img.hasAttribute || !img.hasAttribute('data-page-index')) return null;
    const pageIndex = parseInt(img.getAttribute('data-page-index'), 10);
    const leftPt = parseFloat(img.getAttribute('data-page-left-pt'));
    const topPt = parseFloat(img.getAttribute('data-page-top-pt'));
    return (Number.isFinite(pageIndex) && Number.isFinite(leftPt) && Number.isFinite(topPt)) ? { pageIndex, leftPt, topPt } : null;
  }

  function isRepeatedEl(img) {
    return !!img && !!img.matches && img.matches(SELECTOR) && !!gridOfEl(img);
  }

  // Les images répétées d'un HTML déjà posé dans un DOM (celui d'un export), dans l'ordre du document.
  function collect(root) {
    return Array.from(root.querySelectorAll(SELECTOR)).filter(isRepeatedEl);
  }

  // Coin haut gauche de l'image sur la feuille, en points : la grille est comptée depuis le contenu, la feuille commence `marginLeftPt` plus à gauche et `bodyTopPt` plus haut
  // (marge du haut + bande d'en-tête). Même formule pour chaque page : c'est ce qui rend l'image « la même » partout.
  function pagePositionPt(grid, marginLeftPt, bodyTopPt) {
    return { x: marginLeftPt + grid.leftPt, y: bodyTopPt + grid.topPt };
  }

  return { SELECTOR, isRepeatedAttrs, isRepeatedEl, gridOfEl, collect, pagePositionPt };
})();
