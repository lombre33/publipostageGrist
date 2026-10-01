// « Sur toutes les pages » (Antoine, 01/10, la Fiche mission : un triangle bleu dans le coin de chaque feuille) : une image en calque « derrière le texte » dont la case est
// cochée (`data-repeat="true"`) est peinte à la MÊME place de CHAQUE page, dans l'éditeur, la Lecture, le PDF et le Word.
//
// Ce module est la couche de page : ce que les quatre rendus ont en commun (quelle image en fait partie, et à quelle place de la page), jamais ce que chacun en fait - le PDF
// la peint en fond de chaque page (js/pdf-export.js), le Word l'ancre dans l'en-tête (js/docx-export.js), l'éditeur et la Lecture la dessinent sur chaque feuille. Le filigrane
// (roadmap n° 14, réglé par modèle : PageLayout.getWatermark) s'y appuie : une couche, pas deux. Il n'a pas de place de grille, son texte est centré sur la feuille entière ;
// ce module en donne la géométrie (watermarkLayout : la même taille de caractères, le même angle pour les quatre rendus) et son dessin à l'écran (paintCopies).
//
// La place est celle de la grille page que l'éditeur capture à chaque positionnement de l'image (data-page-index / data-page-left-pt / data-page-top-pt) : en points depuis le
// coin haut gauche du CONTENU de la page (marges et bande d'en-tête comprises, cf. computePageGridPosition, js/header-footer-preview.js). Une image qui n'a pas cette grille
// (document ancien, jamais positionné dans l'Aperçu A4) n'est jamais répétée : sans place connue, il n'y a rien à reproduire.
const PageLayer = (function () {
  const SELECTOR = 'img.editor-image[data-layer="behind"][data-repeat="true"]';
  const finite = value => typeof value === 'number' && isFinite(value);
  const PT_TO_PX = 96 / 72;

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

  // Page d'une ordonnée donnée (en pixels de mise en page, dans le repère de `pages`) : la dernière page qui commence au-dessus ; la gouttière entre deux feuilles revient à
  // celle qui finit.
  function pageIndexAt(pages, y) {
    let found = 0;
    pages.forEach((page, k) => { if (page.top <= y) found = k; });
    return found;
  }

  // === Filigrane ===
  // Taille des caractères : le texte tient sur une ligne qui passe par le centre de la feuille - sa largeur ou 80 % pour un texte horizontal, 72 % de la plus grande diagonale
  // à 45° qui reste dans la feuille (le petit côté × √2) pour un texte en diagonale. Cette ligne est divisée par la largeur estimée du texte, en « em » d'une police sans
  // empattement en gras (Roboto Bold, celle du PDF) : une estimation par famille de caractères plutôt qu'une mesure du navigateur, qui dépend des polices de la machine - le PDF,
  // le Word, l'éditeur et la Lecture reçoivent ainsi le MÊME corps en points, d'une machine à l'autre. Elle se trompe de quelques pour cent, que les 20 % de réserve absorbent.
  const WATERMARK_DIAGONAL_DEG = -45;
  const WATERMARK_FILL = { diagonal: 0.72, horizontal: 0.8 };
  const WATERMARK_MIN_PT = 6;
  const WATERMARK_MAX_PT = 200;
  const WATERMARK_MAX_VS_SMALL_SIDE = 0.45;
  function watermarkTextWidthEm(text) {
    let em = 0;
    for (const ch of text) {
      if (ch === ' ') em += 0.28;
      else if (/[mwMW@%]/.test(ch)) em += 0.85;
      else if (/[iljI.,:;'’!|]/.test(ch)) em += 0.3;
      else if (/[tfr]/.test(ch)) em += 0.38;
      else if (/\p{Lu}/u.test(ch)) em += 0.67;
      else if (/\d/.test(ch)) em += 0.56;
      else em += 0.55;
    }
    return em;
  }

  // Géométrie d'un filigrane réglé (PageLayout.getWatermark) sur une page de `pageWidthPt` × `pageHeightPt` : { text, fontSizePt, angleDeg, color, opacity }, ou null sans
  // filigrane. L'angle est celui de CSS (rotate) et de pdfmake (watermark.angle) : négatif = le texte monte vers la droite. Le texte est centré sur la feuille entière.
  function watermarkLayout(watermark, pageWidthPt, pageHeightPt) {
    if (!watermark || !watermark.text || !(pageWidthPt > 0) || !(pageHeightPt > 0)) return null;
    const horizontal = watermark.angle === 'horizontal';
    const small = Math.min(pageWidthPt, pageHeightPt);
    const room = (horizontal ? pageWidthPt * WATERMARK_FILL.horizontal : small * Math.SQRT2 * WATERMARK_FILL.diagonal);
    const fontSize = Math.min(WATERMARK_MAX_PT, small * WATERMARK_MAX_VS_SMALL_SIDE, Math.max(WATERMARK_MIN_PT, room / watermarkTextWidthEm(watermark.text)));
    return { text: watermark.text, fontSizePt: Math.round(fontSize * 10) / 10, angleDeg: horizontal ? 0 : WATERMARK_DIAGONAL_DEG, color: watermark.color, opacity: watermark.opacity };
  }

  // Sa ligne de base : un em de Roboto compte 0,927 de montée et 0,244 de descente (PDFKit pose la boîte de 1,171 em centrée sur la page, le navigateur celle de 1 em d'une
  // ligne `line-height: 1` : la ligne de base tombe, dans les deux, 0,342 em sous le centre). Le dessin du Word (js/docx-export.js) s'y cale aussi.
  const WATERMARK_BASELINE_EM = 0.342;

  // Le texte à l'écran : un bloc centré (`left`/`top` à 50 % de la boîte de la page), tourné autour de son centre. `aria-hidden` par la couche qui le porte.
  function watermarkElement(layout) {
    const el = document.createElement('div');
    el.className = 'v2-page-watermark';
    el.textContent = layout.text;
    el.style.fontSize = (layout.fontSizePt * PT_TO_PX) + 'px';
    el.style.color = layout.color;
    el.style.opacity = String(layout.opacity);
    el.style.transform = 'translate(-50%, -50%) rotate(' + layout.angleDeg + 'deg)';
    return el;
  }

  // Peint les copies de la couche sur les pages d'un rendu écran (éditeur, Lecture) : une boîte rognée par page, de la taille de la feuille (ce qui sort de la page est coupé,
  // comme dans le PDF), où chaque image est posée à sa place de grille - le même décalage depuis le coin du contenu de la page, page après page. Pas de copie sur la page
  // où l'image d'origine se trouve déjà (`skipPage`) : c'est elle qui s'y montre, déplaçable. Tout est en pixels de mise en page, dans le repère de la couche (celui des
  // bandes de pagination : le conteneur du rendu, zoom de la feuille compris). Le filigrane (`watermark` : watermarkLayout) est le premier de chaque boîte, sous les images.
  //   spec = { left, width, pageHeight, contentLeft, pages: [{ top, bodyTop }], items: [{ src, width, height, leftPt, topPt, opacity, skipPage, fromPage, toPage }], watermark }
  function paintCopies(layerEl, spec) {
    while (layerEl.firstChild) layerEl.removeChild(layerEl.firstChild);
    spec.pages.forEach((page, k) => {
      const here = spec.items.filter(item => k !== item.skipPage && k >= (item.fromPage || 0) && (item.toPage == null || k <= item.toPage));
      if (!here.length && !spec.watermark) return;
      const box = document.createElement('div');
      box.className = 'v2-page-layer-page';
      box.style.left = spec.left + 'px';
      box.style.top = page.top + 'px';
      box.style.width = spec.width + 'px';
      box.style.height = spec.pageHeight + 'px';
      if (spec.watermark) box.appendChild(watermarkElement(spec.watermark));
      here.forEach(item => {
        const img = document.createElement('img');
        img.className = 'v2-page-layer-copy';
        img.alt = '';
        img.draggable = false;
        img.src = item.src;
        img.style.left = (spec.contentLeft + item.leftPt * PT_TO_PX) + 'px';
        img.style.top = (page.bodyTop - page.top + item.topPt * PT_TO_PX) + 'px';
        img.style.width = item.width + 'px';
        img.style.height = item.height + 'px';
        if (item.opacity != null && item.opacity !== 1) img.style.opacity = String(item.opacity);
        box.appendChild(img);
      });
      layerEl.appendChild(box);
    });
  }

  return { SELECTOR, PT_TO_PX, WATERMARK_BASELINE_EM, isRepeatedAttrs, isRepeatedEl, gridOfEl, collect, pagePositionPt, pageIndexAt, paintCopies, watermarkLayout, watermarkElement };
})();
