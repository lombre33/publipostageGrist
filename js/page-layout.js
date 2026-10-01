// Marges de page par modèle - même esprit que HeaderFooterPreview (brouillon en mémoire, persistance déléguée à Templates.save), mais pour 4 nombres
// (mm) plutôt que du contenu riche. Source de vérité unique pour la largeur de contenu, consommée par l'aperçu A4 (CSS), js/pdf-export.js et
// js/docx-export.js - avant ce module, la même marge (28pt) était dupliquée indépendamment à ces 3 endroits.
// Orientation de la page (portrait / paysage) : même brouillon, même colonne Margins de Templates (clé `orientation` du JSON, absente = portrait) - aucune
// colonne Grist de plus, et un modèle enregistré avant ce réglage se recharge en portrait, à l'identique. Les dimensions de la page courante se lisent par
// getPageSize*() et getContent*Mm() ; A4_WIDTH_MM / A4_HEIGHT_MM restent celles du A4 PORTRAIT.
const PageLayout = (function () {
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const PORTRAIT = 'portrait';
  const LANDSCAPE = 'landscape';
  const MM_TO_PT = 72 / 25.4; // ~2.8346
  const MM_TO_TWIP = 1440 / 25.4; // ~56.6929
  const PT_TO_PX = 96 / 72;
  const MM_TO_PX = MM_TO_PT * PT_TO_PX;
  // DOIT convertir exactement vers 28pt (l'ancienne constante PAGE_MARGIN_PT, encore le repli de js/pdf-export.js/js/docx-export.js) - un modèle sans
  // réglage de marges propre doit rendre un résultat pixel-identique à avant ce module.
  const DEFAULT_MARGIN_MM = 28 / MM_TO_PT;
  // Gouttière entre les 2 colonnes d'une zone twoColumnsZone - `gap: 16px` dans css/editor-v2.css (éditeur ET mode Lecture). Exposée ici pour que
  // js/editor-nodes.js (popover mm), js/pdf-export.js et js/docx-export.js partent tous du même nombre plutôt que de le redupliquer.
  const COLUMN_GAP_PX = 16;
  // Plancher de surface imprimable. Sans lui, deux marges opposées un peu généreuses (150 + 80 par ex.) donnent une largeur de contenu NÉGATIVE : la zone
  // de saisie s'effondre à 0, les colonnes en mm deviennent absurdes et pdfmake reçoit une largeur de page négative. 20mm = à peu près la largeur d'une
  // étiquette, assez petit pour ne gêner aucun usage réel et assez grand pour que le document reste manipulable.
  const MIN_CONTENT_MM = 20;

  function emptyMargins() {
    return { top: DEFAULT_MARGIN_MM, right: DEFAULT_MARGIN_MM, bottom: DEFAULT_MARGIN_MM, left: DEFAULT_MARGIN_MM, orientation: PORTRAIT };
  }

  let marginsDraft = emptyMargins();

  // Les 4 marges (mm) ET l'orientation : c'est cet objet que js/main.js passe tel quel à Templates.save (colonne Margins) et que Templates.loadAll
  // rend dans `marginsMm` - l'orientation voyage donc avec les marges, sans appel de plus à aucun des trois sites d'enregistrement.
  function getMarginsMm() { return marginsDraft; }

  // Toute valeur autre que 'landscape' (clé absente, JSON abîmé, ancienne version) est le portrait.
  function normalizeOrientation(value) { return value === LANDSCAPE ? LANDSCAPE : PORTRAIT; }

  function pageSizeMm(orientation) {
    return orientation === LANDSCAPE ? { width: A4_HEIGHT_MM, height: A4_WIDTH_MM } : { width: A4_WIDTH_MM, height: A4_HEIGHT_MM };
  }

  // Chaque côté est d'abord ramené dans [0, max], puis la PAIRE est réduite proportionnellement si elle dépasse - un résultat déterministe et indépendant
  // de l'ordre de saisie (contrairement à un rabot du seul dernier côté modifié, qui donnerait deux états différents pour les deux mêmes saisies).
  function clampPair(a, b, dimension) {
    const max = dimension - MIN_CONTENT_MM;
    let x = Math.max(0, Math.min(max, Number.isFinite(a) ? a : 0));
    let y = Math.max(0, Math.min(max, Number.isFinite(b) ? b : 0));
    const sum = x + y;
    if (sum > max) { const k = max / sum; x *= k; y *= k; }
    return [x, y];
  }

  // data = { top, right, bottom, left, orientation } en mm, ou null/undefined (repli sur les marges par défaut, en portrait). Toute clé manquante retombe
  // individuellement sur le défaut plutôt que sur 0 - un objet partiel reste sûr à passer (sans `orientation`, c'est le portrait). Les valeurs sont bornées
  // (cf. clampPair, sur les dimensions de la page de CETTE orientation) : `getMarginsMm()` peut donc rendre autre chose que ce qui a été passé, et c'est cette
  // valeur bornée qui fait foi partout (aperçu, exports, champs de l'onglet Réglages).
  function setMarginsMm(data) {
    const merged = data && typeof data === 'object' ? Object.assign(emptyMargins(), data) : emptyMargins();
    const orientation = normalizeOrientation(merged.orientation);
    const page = pageSizeMm(orientation);
    const [left, right] = clampPair(merged.left, merged.right, page.width);
    const [top, bottom] = clampPair(merged.top, merged.bottom, page.height);
    marginsDraft = { top, right, bottom, left, orientation };
    applyToPreviewCss();
  }

  function getOrientation() { return marginsDraft.orientation; }
  function isLandscape() { return marginsDraft.orientation === LANDSCAPE; }
  // Change l'orientation en gardant les 4 marges (re-bornées pour la nouvelle page). Ne touche ni à l'aperçu, ni à la pagination, ni aux exports : l'appelant
  // rafraîchit ce qu'il affiche (Editor.refreshLayout) et marque le brouillon modifié (événement pp:marginsChanged, cf. js/settings.js).
  function setOrientation(orientation) { setMarginsMm(Object.assign({}, marginsDraft, { orientation: normalizeOrientation(orientation) })); }

  // Page courante (orientation comprise) dans chaque unité des moteurs : mm, pt (pdfmake), px CSS (aperçu, pagination), twip (docx).
  function getPageSizeMm() { return pageSizeMm(marginsDraft.orientation); }
  function getPageSizePt() { const s = getPageSizeMm(); return { width: s.width * MM_TO_PT, height: s.height * MM_TO_PT }; }
  function getPageSizePx() { const s = getPageSizeMm(); return { width: s.width * MM_TO_PX, height: s.height * MM_TO_PX }; }
  function getPageSizeTwip() { const s = getPageSizeMm(); return { width: Math.round(s.width * MM_TO_TWIP), height: Math.round(s.height * MM_TO_TWIP) }; }

  function getContentWidthMm() { return getPageSizeMm().width - marginsDraft.left - marginsDraft.right; }
  function getContentHeightMm() { return getPageSizeMm().height - marginsDraft.top - marginsDraft.bottom; }
  function getColumnGapMm() { return COLUMN_GAP_PX / MM_TO_PX; }

  function getMarginsPt() {
    const m = marginsDraft;
    return { top: m.top * MM_TO_PT, right: m.right * MM_TO_PT, bottom: m.bottom * MM_TO_PT, left: m.left * MM_TO_PT };
  }

  // Marges en pixels CSS - même conversion que applyToPreviewCss ci-dessous. Consommées par les deux moteurs de pagination à l'écran
  // (js/header-footer-preview.js, js/reader-mode.js), qui codaient auparavant 37.33px en dur et ignoraient donc totalement les marges du modèle.
  function getMarginsPx() {
    const p = getMarginsPt();
    return { top: p.top * PT_TO_PX, right: p.right * PT_TO_PX, bottom: p.bottom * PT_TO_PX, left: p.left * PT_TO_PX };
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
    const px = getMarginsPx();
    const root = document.documentElement.style;
    root.setProperty('--pp-margin-top', px.top + 'px');
    root.setProperty('--pp-margin-right', px.right + 'px');
    root.setProperty('--pp-margin-bottom', px.bottom + 'px');
    root.setProperty('--pp-margin-left', px.left + 'px');
  }

  // Texte d'un numéro de page pour l'un des trois formats du badge .page-number-badge (data-format : 'n', 'page-n', 'n-slash-total'). Pure. Source unique :
  // l'aperçu paginé de l'éditeur (js/header-footer-preview.js), le mode Lecture (js/reader-mode.js) et l'export PDF (js/pdf-export.js) recopiaient chacun cette
  // conversion (l'export DOCX, lui, pose de vrais champs PAGE/NUMPAGES : js/docx-export.js).
  function pageNumberText(format, pageNum, totalPages) {
    if (format === 'page-n') return 'Page ' + pageNum;
    if (format === 'n-slash-total') return pageNum + '/' + totalPages;
    return String(pageNum);
  }
  // Résout chaque badge .page-number-badge d'un fragment HTML en son texte pour cette page ; renvoie le HTML résolu.
  function resolvePageNumberBadges(html, pageNum, totalPages) {
    const host = document.createElement('div');
    host.innerHTML = html || '';
    host.querySelectorAll('.page-number-badge').forEach(badge => {
      badge.textContent = pageNumberText(badge.getAttribute('data-format') || 'n', pageNum, totalPages);
    });
    return host.innerHTML;
  }

  return {
    A4_WIDTH_MM, A4_HEIGHT_MM, MM_TO_PT, MM_TO_TWIP, MM_TO_PX, COLUMN_GAP_PX, MIN_CONTENT_MM, DEFAULT_MARGIN_MM, PORTRAIT, LANDSCAPE,
    getMarginsMm, setMarginsMm, getContentWidthMm, getContentHeightMm, getColumnGapMm, getMarginsPt, getMarginsPx, getMarginsTwip, applyToPreviewCss,
    getOrientation, isLandscape, setOrientation, getPageSizeMm, getPageSizePt, getPageSizePx, getPageSizeTwip,
    pageNumberText, resolvePageNumberBadges,
  };
})();
