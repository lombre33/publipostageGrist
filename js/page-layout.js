// Marges de page par modèle - même esprit que HeaderFooterPreview (brouillon en mémoire, persistance déléguée à Templates.save), mais pour 4 nombres
// (mm) plutôt que du contenu riche. Source de vérité unique pour la largeur de contenu, consommée par l'aperçu A4 (CSS), js/pdf-export.js et
// js/docx-export.js - avant ce module, la même marge (28pt) était dupliquée indépendamment à ces 3 endroits.
const PageLayout = (function () {
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const MM_TO_PT = 72 / 25.4; // ~2.8346
  const MM_TO_TWIP = 1440 / 25.4; // ~56.6929
  const PT_TO_PX = 96 / 72;
  // DOIT convertir exactement vers 28pt (l'ancienne constante PAGE_MARGIN_PT, encore le repli de js/pdf-export.js/js/docx-export.js) - un modèle sans
  // réglage de marges propre doit rendre un résultat pixel-identique à avant ce module.
  const DEFAULT_MARGIN_MM = 28 / MM_TO_PT;

  function emptyMargins() {
    return { top: DEFAULT_MARGIN_MM, right: DEFAULT_MARGIN_MM, bottom: DEFAULT_MARGIN_MM, left: DEFAULT_MARGIN_MM };
  }

  let marginsDraft = emptyMargins();

  function getMarginsMm() { return marginsDraft; }

  // data = { top, right, bottom, left } en mm, ou null/undefined (repli sur les marges par défaut). Toute clé manquante retombe individuellement sur le
  // défaut plutôt que sur 0 - un objet partiel reste sûr à passer.
  function setMarginsMm(data) {
    marginsDraft = data && typeof data === 'object' ? Object.assign(emptyMargins(), data) : emptyMargins();
    applyToPreviewCss();
  }

  function getContentWidthMm() { return A4_WIDTH_MM - marginsDraft.left - marginsDraft.right; }
  function getContentHeightMm() { return A4_HEIGHT_MM - marginsDraft.top - marginsDraft.bottom; }

  function getMarginsPt() {
    const m = marginsDraft;
    return { top: m.top * MM_TO_PT, right: m.right * MM_TO_PT, bottom: m.bottom * MM_TO_PT, left: m.left * MM_TO_PT };
  }

  function getMarginsTwip() {
    const m = marginsDraft;
    return {
      top: Math.round(m.top * MM_TO_TWIP), right: Math.round(m.right * MM_TO_TWIP),
      bottom: Math.round(m.bottom * MM_TO_TWIP), left: Math.round(m.left * MM_TO_TWIP),
    };
  }

  // Posées sur :root (pas #editor-container) - #editor-container et #reader-container sont deux conteneurs FRÈRES (l'aperçu paginé en lecture,
  // .v2-page-band-header/.v2-page-break-line etc., n'est scopé à aucun des deux dans le CSS), une variable custom ne descend que le long de l'arbre DOM :
  // seul un ancêtre commun aux deux garantit qu'elle soit vue partout où css/editor-v2.css la consomme. `.a4-preview` garde 37.33px comme repli CSS pour
  // tout contexte où ce module n'aurait pas encore tourné (ex. avant le premier setMarginsMm au chargement).
  function applyToPreviewCss() {
    const p = getMarginsPt();
    const root = document.documentElement.style;
    root.setProperty('--pp-margin-top', (p.top * PT_TO_PX) + 'px');
    root.setProperty('--pp-margin-right', (p.right * PT_TO_PX) + 'px');
    root.setProperty('--pp-margin-bottom', (p.bottom * PT_TO_PX) + 'px');
    root.setProperty('--pp-margin-left', (p.left * PT_TO_PX) + 'px');
  }

  return {
    A4_WIDTH_MM, A4_HEIGHT_MM, MM_TO_PT, MM_TO_TWIP,
    getMarginsMm, setMarginsMm, getContentWidthMm, getContentHeightMm, getMarginsPt, getMarginsTwip, applyToPreviewCss,
  };
})();
