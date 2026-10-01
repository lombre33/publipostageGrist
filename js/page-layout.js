// Marges de page par modèle - même esprit que HeaderFooterPreview (brouillon en mémoire, persistance déléguée à Templates.save), mais pour 4 nombres
// (mm) plutôt que du contenu riche. Source de vérité unique pour la largeur de contenu, consommée par l'aperçu A4 (CSS), js/pdf-export.js et
// js/docx-export.js - avant ce module, la même marge (28pt) était dupliquée indépendamment à ces 3 endroits.
// Orientation de la page (portrait / paysage) : même brouillon, même colonne Margins de Templates (clé `orientation` du JSON, absente = portrait) - aucune
// colonne Grist de plus, et un modèle enregistré avant ce réglage se recharge en portrait, à l'identique. Les dimensions de la page courante se lisent par
// getPageSize*() et getContent*Mm() ; A4_WIDTH_MM / A4_HEIGHT_MM restent celles du A4 PORTRAIT.
// Format de la page (A3, A4, A5, A6) : même brouillon, même colonne, clé `format` du JSON (absente = A4, comme un modèle enregistré avant ce réglage). FORMATS
// est la SEULE table des formats : millimètres (l'écran), points (pdfmake) et twips (Word) y sont écrits côte à côte, dans le sens portrait, avec le nom que
// pdfmake et jsPDF donnent au format - un format de plus est une ligne de cette table, sans autre fichier à toucher.
const PageLayout = (function () {
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const PORTRAIT = 'portrait';
  const LANDSCAPE = 'landscape';
  // Formats proposés, dans l'ordre du menu de la barre. Dimensions du PORTRAIT : mm (écran), pt (pdfmake : standardPageSizes) et twips (Word), pas des
  // conversions les unes des autres - A4 = 595.28 x 841.89 pt et 11906 x 16838 twips donnent un modèle A4 dont les largeurs de contenu sont, au centième de point,
  // celles d'avant les formats. `pdfName` : le nom que pdfmake (`pageSize`) et jsPDF (`format`, en minuscules) donnent à ce format.
  const FORMATS = [
    { id: 'A3', pdfName: 'A3', widthMm: 297, heightMm: 420, widthPt: 841.89, heightPt: 1190.55, widthTwip: 16838, heightTwip: 23811 },
    { id: 'A4', pdfName: 'A4', widthMm: 210, heightMm: 297, widthPt: 595.28, heightPt: 841.89, widthTwip: 11906, heightTwip: 16838 },
    { id: 'A5', pdfName: 'A5', widthMm: 148, heightMm: 210, widthPt: 419.53, heightPt: 595.28, widthTwip: 8391, heightTwip: 11906 },
    { id: 'A6', pdfName: 'A6', widthMm: 105, heightMm: 148, widthPt: 297.64, heightPt: 419.53, widthTwip: 5953, heightTwip: 8391 },
  ];
  const DEFAULT_FORMAT = 'A4';
  // Largeur de la feuille A4 portrait à l'écran, telle que css/editor-v2.css l'écrivait avant l'orientation (210 mm à 96 dpi, arrondis au centième vers le haut).
  const PORTRAIT_SHEET_WIDTH_PX = 793.71;
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
    return { top: DEFAULT_MARGIN_MM, right: DEFAULT_MARGIN_MM, bottom: DEFAULT_MARGIN_MM, left: DEFAULT_MARGIN_MM, orientation: PORTRAIT, format: DEFAULT_FORMAT };
  }

  let marginsDraft = emptyMargins();

  // Les 4 marges (mm), l'orientation ET le format : c'est cet objet que js/main.js passe tel quel à Templates.save (colonne Margins) et que Templates.loadAll
  // rend dans `marginsMm` - le sens et le format voyagent donc avec les marges, sans appel de plus à aucun des trois sites d'enregistrement.
  function getMarginsMm() { return marginsDraft; }

  // Toute valeur autre que 'landscape' (clé absente, JSON abîmé, ancienne version) est le portrait.
  function normalizeOrientation(value) { return value === LANDSCAPE ? LANDSCAPE : PORTRAIT; }

  // Tout format inconnu (clé absente, JSON abîmé, format d'une version plus récente) est l'A4. Casse ignorée : 'a5' est A5.
  function formatOf(value) {
    const id = typeof value === 'string' ? value.toUpperCase() : '';
    return FORMATS.find(f => f.id === id) || FORMATS.find(f => f.id === DEFAULT_FORMAT);
  }
  function normalizeFormat(value) { return formatOf(value).id; }

  // Les formats proposés (copie : le menu de la barre les lit ici, il n'en écrit aucun). Dimensions du portrait.
  function getFormats() { return FORMATS.map(f => ({ id: f.id, widthMm: f.widthMm, heightMm: f.heightMm })); }

  // Page en mm dans le sens demandé, sans état : les trois unités des moteurs (mm, pt, twip) se déduisent d'un même couple (sens, format).
  function pageSizeMmFor(orientation, format) {
    const f = formatOf(format);
    return orientation === LANDSCAPE ? { width: f.heightMm, height: f.widthMm } : { width: f.widthMm, height: f.heightMm };
  }
  function pageSizeMm(orientation, format) { return pageSizeMmFor(orientation, format); }

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

  // data = { top, right, bottom, left, orientation, format } en mm, ou null/undefined (repli sur les marges par défaut, en portrait A4). Toute clé manquante retombe
  // individuellement sur le défaut plutôt que sur 0 - un objet partiel reste sûr à passer (sans `orientation`, c'est le portrait ; sans `format`, l'A4). Les valeurs
  // sont bornées (cf. clampPair, sur les dimensions de la page de CE sens et de CE format) : `getMarginsMm()` peut donc rendre autre chose que ce qui a été passé,
  // et c'est cette valeur bornée qui fait foi partout (aperçu, exports, champs de l'onglet Réglages).
  function setMarginsMm(data) {
    const merged = data && typeof data === 'object' ? Object.assign(emptyMargins(), data) : emptyMargins();
    const orientation = normalizeOrientation(merged.orientation);
    const format = normalizeFormat(merged.format);
    const page = pageSizeMm(orientation, format);
    const [left, right] = clampPair(merged.left, merged.right, page.width);
    const [top, bottom] = clampPair(merged.top, merged.bottom, page.height);
    marginsDraft = { top, right, bottom, left, orientation, format };
    applyToPreviewCss();
  }

  // Dimensions de la page selon une orientation et un format donnés, sans état : les exporteurs reçoivent l'un et l'autre avec leurs marges (getMarginsPt /
  // getMarginsTwip) et en déduisent la page sans connaître l'état courant de ce module. Sans format, l'A4. Les valeurs sont celles de pdfmake (A4 = 595.28 x 841.89
  // pt) et de Word (11906 x 16838 twips), pas des conversions de 210 x 297 mm : un modèle A4 portrait garde ainsi des largeurs de contenu identiques, au centième
  // de point, à celles d'avant.
  function pageSizePtFor(orientation, format) {
    const f = formatOf(format);
    return orientation === LANDSCAPE ? { width: f.heightPt, height: f.widthPt } : { width: f.widthPt, height: f.heightPt };
  }
  function pageSizeTwipFor(orientation, format) {
    const f = formatOf(format);
    return orientation === LANDSCAPE ? { width: f.heightTwip, height: f.widthTwip } : { width: f.widthTwip, height: f.heightTwip };
  }
  // Nom du format pour pdfmake (`pageSize`, tel quel) et jsPDF (`format`, en minuscules).
  function pdfPageNameFor(format) { return formatOf(format).pdfName; }

  function getOrientation() { return marginsDraft.orientation; }
  function isLandscape() { return marginsDraft.orientation === LANDSCAPE; }
  function getFormat() { return marginsDraft.format; }
  // Largeur de la feuille à l'écran (px CSS) : celle que `--pp-page-width` donne à la feuille de l'éditeur, à celle de la Lecture et aux espaceurs d'en-tête et de
  // pied (css/editor-v2.css), et que js/main.js lit pour le facteur d'ajustement. L'A4 portrait garde la valeur d'avant l'orientation (793.71), PAS
  // getPageSizePx().width (793.7008) : il garde sa feuille et son facteur d'ajustement exactement tels qu'ils étaient. Tout autre couple (sens, format) : la
  // largeur de la page en mm, au centième de pixel (A4 paysage 1122.52, A5 portrait 559.37...).
  function getSheetWidthPx() {
    if (marginsDraft.orientation === PORTRAIT && marginsDraft.format === DEFAULT_FORMAT) return PORTRAIT_SHEET_WIDTH_PX;
    return Math.round(getPageSizePx().width * 100) / 100;
  }

  // `pp:pageLayoutChanged` : émis seulement quand l'orientation ou le format CHANGE réellement (pas à chaque setMarginsMm : charger un modèle l'appelle alors
  // que l'éditeur contient encore le modèle précédent, et js/main.js rafraîchit lui-même juste après avoir posé le nouveau). js/main.js y rafraîchit le
  // facteur d'ajustement, la pagination, la grille des images en calque et la Lecture - le bouton et le menu (js/orientation-toggle.js) ne rafraîchissent
  // rien eux-mêmes.
  function announcePageLayoutChanged() {
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged', { detail: { orientation: marginsDraft.orientation, format: marginsDraft.format } }));
  }
  // Change l'orientation en gardant les 4 marges (re-bornées pour la nouvelle page). Ne touche ni à l'aperçu, ni à la pagination, ni aux exports : l'appelant
  // rafraîchit ce qu'il affiche (Editor.refreshLayout) et marque le brouillon modifié (événement pp:marginsChanged, cf. js/settings.js).
  function setOrientation(orientation) {
    const next = normalizeOrientation(orientation);
    if (next === marginsDraft.orientation) return;
    setMarginsMm(Object.assign({}, marginsDraft, { orientation: next }));
    announcePageLayoutChanged();
  }

  // Change le format en gardant le sens et les 4 marges en millimètres (re-bornées pour la nouvelle page, comme au changement de sens : une marge de 100 mm à
  // gauche ne tient plus dans une page A6 de 105 mm, et ne revient pas au retour en A4). Même contrat que setOrientation : ne rafraîchit rien, annonce
  // `pp:pageLayoutChanged` si le format change, l'appelant marque le brouillon modifié (pp:marginsChanged).
  function setFormat(format) {
    const next = normalizeFormat(format);
    if (next === marginsDraft.format) return;
    setMarginsMm(Object.assign({}, marginsDraft, { format: next }));
    announcePageLayoutChanged();
  }

  // Page courante (sens et format compris) dans chaque unité des moteurs : mm, pt (pdfmake), px CSS (aperçu, pagination), twip (docx).
  function getPageSizeMm() { return pageSizeMm(marginsDraft.orientation, marginsDraft.format); }
  function getPageSizePt() { const s = getPageSizeMm(); return { width: s.width * MM_TO_PT, height: s.height * MM_TO_PT }; }
  function getPageSizePx() { const s = getPageSizeMm(); return { width: s.width * MM_TO_PX, height: s.height * MM_TO_PX }; }
  function getPageSizeTwip() { const s = getPageSizeMm(); return { width: Math.round(s.width * MM_TO_TWIP), height: Math.round(s.height * MM_TO_TWIP) }; }

  function getContentWidthMm() { return getPageSizeMm().width - marginsDraft.left - marginsDraft.right; }
  function getContentHeightMm() { return getPageSizeMm().height - marginsDraft.top - marginsDraft.bottom; }
  function getColumnGapMm() { return COLUMN_GAP_PX / MM_TO_PX; }

  // `orientation` et `format` voyagent avec les marges : c'est l'objet que js/main.js passe tel quel aux exporteurs (exportCurrentRecord, export en lot), qui
  // n'ont donc aucun autre canal pour apprendre que la page est en paysage, ou en A5.
  function getMarginsPt() {
    const m = marginsDraft;
    return { top: m.top * MM_TO_PT, right: m.right * MM_TO_PT, bottom: m.bottom * MM_TO_PT, left: m.left * MM_TO_PT, orientation: m.orientation, format: m.format };
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
      orientation: m.orientation, format: m.format,
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
    // Largeur de la feuille : 793.71px en A4 portrait (la valeur d'avant l'orientation, que css/editor-v2.css garde aussi en repli avant ce premier appel), 1122.52px en
    // A4 paysage, 559.37px en A5 portrait...
    root.setProperty('--pp-page-width', getSheetWidthPx() + 'px');
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
    A4_WIDTH_MM, A4_HEIGHT_MM, MM_TO_PT, MM_TO_TWIP, MM_TO_PX, COLUMN_GAP_PX, MIN_CONTENT_MM, DEFAULT_MARGIN_MM, PORTRAIT, LANDSCAPE, DEFAULT_FORMAT,
    getMarginsMm, setMarginsMm, getContentWidthMm, getContentHeightMm, getColumnGapMm, getMarginsPt, getMarginsPx, getMarginsTwip, applyToPreviewCss,
    getOrientation, isLandscape, setOrientation, getPageSizeMm, getPageSizePt, getPageSizePx, getPageSizeTwip, getSheetWidthPx, pageSizePtFor, pageSizeTwipFor,
    getFormats, getFormat, setFormat, normalizeFormat, pageSizeMmFor, pdfPageNameFor,
    pageNumberText, resolvePageNumberBadges,
  };
})();
