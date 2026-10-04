// Réglages de page par modèle : marges, orientation, format, filigrane. Même esprit que HeaderFooterPreview (brouillon en mémoire, persistance
// déléguée à Templates.save). Source de vérité unique pour la largeur de contenu, consommée par l'aperçu A4 (CSS), js/pdf-export.js et
// js/docx-export.js.
//
// Tout voyage dans le même JSON de la colonne Margins de Templates, sans colonne Grist de plus, et un modèle enregistré avant un réglage se recharge
// à l'identique :
// - les quatre marges (mm) ;
// - `orientation` : portrait ou paysage (absente = portrait). Les dimensions de la page courante se lisent par getPageSize*() et getContent*Mm() ;
//   A4_WIDTH_MM / A4_HEIGHT_MM restent celles du A4 portrait ;
// - `format` : A3, A4, A5 ou A6 (absente = A4). FORMATS est la seule table des formats : millimètres (l'écran), points (pdfmake) et twips (Word) y
//   sont écrits côte à côte, dans le sens portrait, avec le nom que pdfmake et jsPDF donnent au format ; un format de plus est une ligne de cette
//   table ;
// - format libre (largeur x hauteur saisies en cm, fenêtre « Format libre… » du menu Page) : `format` porte alors la dimension elle-même,
//   « LARGEURxHAUTEUR » en millimètres, côté court d'abord (le sens portrait, comme FORMATS) et au dixième de millimètre : « 37x70 » est une page de
//   3,7 x 7 cm, que `orientation` tourne en paysage. Chaque moteur qui lit le format par formatOf / pageSize*For (aperçu, Lecture, PDF, Word,
//   assemblage avant impression) le suit sans autre changement. Une dimension égale à celle d'un format de FORMATS (21 x 29,7 cm) redevient ce format
//   : le menu le coche, rien n'est enregistré en double ;
// - `watermark` : un texte en travers de chaque page, propre au modèle (absent = pas de filigrane). Ce module le garde et le borne
//   (normalizeWatermark) ; sa géométrie et son dessin sont à js/page-layer.js.
const PageLayout = (function () {
  // Les nombres de la page : A4, sens, unités (mm, pt, px, twip), marge par défaut, bandes réservées, planchers. Des constantes, sans état.
  const Units = (function () {
    const A4_WIDTH_MM = 210;
    const A4_HEIGHT_MM = 297;
    const PORTRAIT = 'portrait';
    const LANDSCAPE = 'landscape';
    // Largeur de la feuille A4 portrait à l'écran (210 mm à 96 dpi, arrondis au centième vers le haut), la valeur de repli de css/editor-v2.css.
    const PORTRAIT_SHEET_WIDTH_PX = 793.71;
    const MM_TO_PT = 72 / 25.4; // ~2.8346
    const MM_TO_TWIP = 1440 / 25.4; // ~56.6929
    const PT_TO_PX = 96 / 72;
    const MM_TO_PX = MM_TO_PT * PT_TO_PX;
    // La marge par défaut : celle d'un modèle sans réglage de marges, et le repli de js/pdf-export.js et js/docx-export.js quand on les appelle sans
    // marges. 28 pt, que DEFAULT_MARGIN_MM convertit exactement.
    const DEFAULT_MARGIN_PT = 28;
    const DEFAULT_MARGIN_MM = DEFAULT_MARGIN_PT / MM_TO_PT;
    // Gouttière entre les deux colonnes d'une zone twoColumnsZone : `gap: 16px` dans css/editor-v2.css (éditeur et mode Lecture). Exposée ici pour que
    // js/editor-nodes.js (popover mm), js/pdf-export.js et js/docx-export.js partent du même nombre.
    const COLUMN_GAP_PX = 16;
    // La bande qu'un en-tête (sous la marge du haut) ou un pied (au-dessus de la marge du bas) réserve sur chaque page dès que l'une de ses variantes a
    // du contenu : un plafond fixe de 60 px plus un écart de 10 pt, jamais la hauteur rendue du texte. L'éditeur, la Lecture, le PDF et le Word la
    // réservent à l'identique : mesurée sur le texte, elle décalerait tout le corps, images en calque comprises, d'un rendu à l'autre.
    const HEADER_FOOTER_ZONE_PX = 60;
    const HEADER_FOOTER_GAP_PT = 10;
    const HEADER_FOOTER_GAP_PX = HEADER_FOOTER_GAP_PT * PT_TO_PX;
    const HEADER_FOOTER_BAND_PX = HEADER_FOOTER_ZONE_PX + HEADER_FOOTER_GAP_PX;
    // Un fragment d'en-tête ou de pied montre quelque chose s'il a du texte (un numéro de page, une variable ou une puce en portent un) ou une image ;
    // une zone vide ne réserve rien.
    function hasZoneContent(html) { return !!html && (!!html.replace(/<[^>]*>/g, '').trim() || /<img[\s>]/i.test(html)); }
    // Plancher de surface imprimable. Sans lui, deux marges opposées un peu généreuses (150 + 80 par exemple) donnent une largeur de contenu négative :
    // la zone de saisie s'effondre, les colonnes en mm deviennent absurdes et pdfmake reçoit une largeur de page négative. 20 mm, à peu près la largeur
    // d'une étiquette, ne gêne aucun usage réel et laisse le document manipulable.
    const MIN_CONTENT_MM = 20;
    // Les marges d'un modèle neuf (9,9 mm) ne tiennent pas dans une étiquette : 70 x 37 mm n'y garde que 50 x 20 mm de texte, et l'éditeur coupe en 7
    // pages ce que le PDF fait tenir en 5. Quand la saisie d'une page de moins de SMALL_PAGE_MM de côté court trouve les quatre marges encore à leur
    // valeur d'origine, elles passent à SMALL_PAGE_MARGIN_MM ; des marges déjà réglées par la personne ne sont jamais touchées. Une page de moins de
    // HEADER_FOOTER_MIN_HEIGHT_MM de haut ne reçoit plus de nouvel en-tête ni de nouveau pied : leurs bandes réservées (60 px et leur air, chacune) la
    // mangeraient.
    const SMALL_PAGE_MM = 60;
    const SMALL_PAGE_MARGIN_MM = 3;
    const HEADER_FOOTER_MIN_HEIGHT_MM = 80;
    return {
      A4_WIDTH_MM, A4_HEIGHT_MM, PORTRAIT, LANDSCAPE, PORTRAIT_SHEET_WIDTH_PX, MM_TO_PT, MM_TO_TWIP, PT_TO_PX, MM_TO_PX, DEFAULT_MARGIN_PT, DEFAULT_MARGIN_MM,
      COLUMN_GAP_PX, HEADER_FOOTER_ZONE_PX, HEADER_FOOTER_GAP_PT, HEADER_FOOTER_GAP_PX, HEADER_FOOTER_BAND_PX, hasZoneContent, MIN_CONTENT_MM,
      SMALL_PAGE_MM, SMALL_PAGE_MARGIN_MM, HEADER_FOOTER_MIN_HEIGHT_MM,
    };
  })();
  const {
    A4_WIDTH_MM, A4_HEIGHT_MM, PORTRAIT, LANDSCAPE, PORTRAIT_SHEET_WIDTH_PX, MM_TO_PT, MM_TO_TWIP, PT_TO_PX, MM_TO_PX, DEFAULT_MARGIN_PT, DEFAULT_MARGIN_MM,
    COLUMN_GAP_PX, HEADER_FOOTER_ZONE_PX, HEADER_FOOTER_GAP_PT, HEADER_FOOTER_GAP_PX, HEADER_FOOTER_BAND_PX, hasZoneContent, MIN_CONTENT_MM,
    SMALL_PAGE_MM, SMALL_PAGE_MARGIN_MM, HEADER_FOOTER_MIN_HEIGHT_MM,
  } = Units;

  // Les formats de page : la table des formats proposés, le format libre « LARGEURxHAUTEUR » et la lecture d'un identifiant de format.
  const Formats = (function () {
    // Formats proposés, dans l'ordre du menu de la barre. Dimensions du portrait : mm (écran), pt (pdfmake : standardPageSizes) et twips (Word),
    // écrites telles quelles plutôt que converties les unes des autres (A4 = 595.28 x 841.89 pt et 11906 x 16838 twips, comme pdfmake et Word).
    // `pdfName` : le nom que pdfmake (`pageSize`) et jsPDF (`format`, en minuscules) donnent à ce format.
    const FORMATS = [
      { id: 'A3', pdfName: 'A3', widthMm: 297, heightMm: 420, widthPt: 841.89, heightPt: 1190.55, widthTwip: 16838, heightTwip: 23811 },
      { id: 'A4', pdfName: 'A4', widthMm: 210, heightMm: 297, widthPt: 595.28, heightPt: 841.89, widthTwip: 11906, heightTwip: 16838 },
      { id: 'A5', pdfName: 'A5', widthMm: 148, heightMm: 210, widthPt: 419.53, heightPt: 595.28, widthTwip: 8391, heightTwip: 11906 },
      { id: 'A6', pdfName: 'A6', widthMm: 105, heightMm: 148, widthPt: 297.64, heightPt: 419.53, widthTwip: 5953, heightTwip: 8391 },
    ];
    const DEFAULT_FORMAT = 'A4';
    // Format libre : chaque côté est borné à [CUSTOM_MIN_MM, CUSTOM_MAX_MM]. Le plancher est celui de la surface imprimable (une page plus petite
    // n'aurait plus de zone de saisie) ; le plafond, 22 pouces = 558,8 mm, est la plus grande page que Word accepte (31680 twips) : au-delà, le .docx
    // serait refusé à l'ouverture.
    const CUSTOM_MIN_MM = MIN_CONTENT_MM;
    const CUSTOM_MAX_MM = 558.8;
    const CUSTOM_ID = /^(\d{1,3}(?:\.\d)?)x(\d{1,3}(?:\.\d)?)$/;

    // Un côté de format libre : au dixième de millimètre, borné. `dimText` l'écrit sans zéro inutile (« 37 », « 70.5 ») : c'est ce texte, et lui seul,
    // qui entre dans l'identifiant.
    function clampDim(mm) { return Math.min(CUSTOM_MAX_MM, Math.max(CUSTOM_MIN_MM, Math.round(mm * 10) / 10)); }
    function dimText(mm) { return String(Math.round(mm * 10) / 10); }

    // Tout format inconnu (clé absente, JSON abîmé, format d'une version plus récente) est l'A4. Casse ignorée : 'a5' est A5. Un identifiant « LxH »
    // (format libre) est lu, ses côtés bornés et remis côté court d'abord ; s'il égale un format de FORMATS, c'est ce format. Le format libre n'a pas
    // de nom pour pdfmake (`pdfName` nul : les dimensions en points sont passées telles quelles, cf. pdfPageNameFor).
    function formatOf(value) {
      const raw = typeof value === 'string' ? value.trim() : '';
      const preset = FORMATS.find(f => f.id === raw.toUpperCase());
      if (preset) return preset;
      const match = CUSTOM_ID.exec(raw.toLowerCase());
      if (match) {
        const a = clampDim(Number(match[1]));
        const b = clampDim(Number(match[2]));
        const widthMm = Math.min(a, b);
        const heightMm = Math.max(a, b);
        const same = FORMATS.find(f => f.widthMm === widthMm && f.heightMm === heightMm);
        if (same) return same;
        return {
          id: dimText(widthMm) + 'x' + dimText(heightMm), pdfName: null, custom: true, widthMm, heightMm,
          widthPt: widthMm * MM_TO_PT, heightPt: heightMm * MM_TO_PT, widthTwip: Math.round(widthMm * MM_TO_TWIP), heightTwip: Math.round(heightMm * MM_TO_TWIP),
        };
      }
      return FORMATS.find(f => f.id === DEFAULT_FORMAT);
    }
    function normalizeFormat(value) { return formatOf(value).id; }
    function isCustomFormat(value) { return !!formatOf(value).custom; }

    // Les formats proposés (copie : le menu de la barre les lit ici, il n'en écrit aucun). Dimensions du portrait. Seuls ceux de FORMATS : le format
    // libre n'est pas une ligne de la table, il a sa propre ligne du menu (« Format libre… ») et sa fenêtre.
    function getFormats() { return FORMATS.map(f => ({ id: f.id, widthMm: f.widthMm, heightMm: f.heightMm })); }
    return { DEFAULT_FORMAT, CUSTOM_MIN_MM, CUSTOM_MAX_MM, clampDim, dimText, formatOf, normalizeFormat, isCustomFormat, getFormats };
  })();
  const { DEFAULT_FORMAT, CUSTOM_MIN_MM, CUSTOM_MAX_MM, clampDim, dimText, formatOf, normalizeFormat, isCustomFormat, getFormats } = Formats;

  // La page dans chaque unité des moteurs, sans état, et le format dans les phrases de l'interface.
  const Sizes = (function () {
    // Un côté en centimètres, au centième au plus (« 7 », « 3,7 », « 7,05 ») : la virgule en français, le point en anglais - la langue de la page, que
    // js/i18n.js pose sur <html>.
    function cmText(mm) {
      const text = String(Math.round(mm * 10) / 100);
      return document.documentElement.lang === 'en' ? text : text.replace('.', ',');
    }
    // Le format dans les phrases de l'interface (« Aperçu {format} », « Page {format} en portrait ») : « A4 » pour un format de FORMATS, « 7 × 3,7 cm »
    // pour un format libre, dans le sens demandé (la page telle qu'on la voit : largeur d'abord).
    function formatLabel(value, orientation) {
      const f = formatOf(value);
      if (!f.custom) return f.id;
      const landscape = orientation === LANDSCAPE;
      return cmText(landscape ? f.heightMm : f.widthMm) + ' × ' + cmText(landscape ? f.widthMm : f.heightMm) + ' cm';
    }

    // Page en mm dans le sens demandé, sans état : les trois unités des moteurs (mm, pt, twip) se déduisent d'un même couple (sens, format).
    function pageSizeMmFor(orientation, format) {
      const f = formatOf(format);
      return orientation === LANDSCAPE ? { width: f.heightMm, height: f.widthMm } : { width: f.widthMm, height: f.heightMm };
    }
    // Dimensions de la page selon une orientation et un format donnés, sans état : les exporteurs reçoivent l'un et l'autre avec leurs marges
    // (getMarginsPt / getMarginsTwip) et en déduisent la page sans connaître l'état courant de ce module. Sans format, l'A4. Les valeurs sont celles de
    // pdfmake (A4 = 595.28 x 841.89 pt) et de Word (11906 x 16838 twips), pas des conversions de 210 x 297 mm : un modèle A4 portrait garde des
    // largeurs de contenu exactes, au centième de point.
    function pageSizePtFor(orientation, format) {
      const f = formatOf(format);
      return orientation === LANDSCAPE ? { width: f.heightPt, height: f.widthPt } : { width: f.widthPt, height: f.heightPt };
    }
    function pageSizeTwipFor(orientation, format) {
      const f = formatOf(format);
      return orientation === LANDSCAPE ? { width: f.heightTwip, height: f.widthTwip } : { width: f.widthTwip, height: f.heightTwip };
    }
    // Nom du format pour pdfmake (`pageSize`, tel quel) et jsPDF (`format`, en minuscules). Un format libre n'a pas de nom : pdfmake reçoit ses
    // dimensions en points, dans le sens portrait (`pageOrientation` les tourne lui-même, comme pour un nom).
    function pdfPageNameFor(format) {
      const f = formatOf(format);
      return f.pdfName || { width: f.widthPt, height: f.heightPt };
    }
    return { cmText, formatLabel, pageSizeMmFor, pageSizePtFor, pageSizeTwipFor, pdfPageNameFor };
  })();
  const { cmText, formatLabel, pageSizeMmFor, pageSizePtFor, pageSizeTwipFor, pdfPageNameFor } = Sizes;

  // Le filigrane d'un modèle : ses bornes et sa lecture.
  const Watermark = (function () {
    // Filigrane : { text, angle: 'diagonal' | 'horizontal', color: '#rrggbb', opacity: 0.05 à 1 } ou null. Un texte vide (ou qui n'est pas un texte)
    // n'est pas un filigrane ; les blancs se réduisent à une espace et le texte tient sur une ligne de WATERMARK_MAX_CHARS caractères au plus ; tout
    // autre réglage inconnu (JSON abîmé, version plus récente) retombe sur sa valeur par défaut, jamais sur une erreur - le gris à 20 % que Word donne
    // à ses filigranes « semi-transparents ».
    const WATERMARK_MAX_CHARS = 40;
    const WATERMARK_DEFAULT = { angle: 'diagonal', color: '#808080', opacity: 0.2 };
    const WATERMARK_MIN_OPACITY = 0.05;
    function normalizeWatermark(value) {
      if (!value || typeof value !== 'object' || typeof value.text !== 'string') return null;
      const text = value.text.replace(/\s+/g, ' ').trim().slice(0, WATERMARK_MAX_CHARS).trim();
      if (!text) return null;
      const opacity = Number(value.opacity);
      return {
        text,
        angle: value.angle === 'horizontal' ? 'horizontal' : WATERMARK_DEFAULT.angle,
        color: typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color.toLowerCase() : WATERMARK_DEFAULT.color,
        opacity: value.opacity != null && value.opacity !== '' && Number.isFinite(opacity) ? Math.min(1, Math.max(WATERMARK_MIN_OPACITY, Math.round(opacity * 100) / 100)) : WATERMARK_DEFAULT.opacity,
      };
    }
    return { WATERMARK_MAX_CHARS, WATERMARK_DEFAULT, normalizeWatermark };
  })();
  const { WATERMARK_MAX_CHARS, WATERMARK_DEFAULT, normalizeWatermark } = Watermark;

  function emptyMargins() {
    return { top: DEFAULT_MARGIN_MM, right: DEFAULT_MARGIN_MM, bottom: DEFAULT_MARGIN_MM, left: DEFAULT_MARGIN_MM, orientation: PORTRAIT, format: DEFAULT_FORMAT };
  }

  let marginsDraft = emptyMargins();

  function getMarginsMm() {
    // Les quatre marges (mm), l'orientation, le format et le filigrane : js/main.js passe cet objet tel quel à Templates.save (colonne Margins) et
    // Templates.loadAll le rend dans `marginsMm`, si bien que le sens et le format voyagent avec les marges sans appel de plus aux trois sites
    // d'enregistrement.
    return marginsDraft;
  }

  function normalizeOrientation(value) {
    // Toute valeur autre que 'landscape' (clé absente, JSON abîmé, ancienne version) est le portrait.
    return value === LANDSCAPE ? LANDSCAPE : PORTRAIT;
  }

  function clampPair(a, b, dimension) {
    // Chaque côté est d'abord ramené dans [0, max], puis la paire est réduite proportionnellement si elle dépasse - un résultat déterministe et
    // indépendant de l'ordre de saisie (contrairement à un rabot du seul dernier côté modifié, qui donnerait deux états différents pour les deux mêmes
    // saisies).
    const max = dimension - MIN_CONTENT_MM;
    let x = Math.max(0, Math.min(max, Number.isFinite(a) ? a : 0));
    let y = Math.max(0, Math.min(max, Number.isFinite(b) ? b : 0));
    const sum = x + y;
    if (sum > max) { const k = max / sum; x *= k; y *= k; }
    return [x, y];
  }

  function pageSizeMm(orientation, format) { return pageSizeMmFor(orientation, format); }

  function setMarginsMm(data) {
    // data = { top, right, bottom, left, orientation, format } en mm, ou null/undefined (repli sur les marges par défaut, en portrait A4). Toute clé
    // manquante retombe individuellement sur le défaut plutôt que sur 0 : un objet partiel reste sûr à passer (sans `orientation`, c'est le portrait ;
    // sans `format`, l'A4). Les valeurs sont bornées (cf. clampPair, sur les dimensions de la page de ce sens et de ce format) : `getMarginsMm()` peut
    // donc rendre autre chose que ce qui a été passé, et c'est cette valeur bornée qui fait foi partout (aperçu, exports, champs de l'onglet Réglages).
    const merged = data && typeof data === 'object' ? Object.assign(emptyMargins(), data) : emptyMargins();
    const orientation = normalizeOrientation(merged.orientation);
    const format = normalizeFormat(merged.format);
    const page = pageSizeMm(orientation, format);
    const [left, right] = clampPair(merged.left, merged.right, page.width);
    const [top, bottom] = clampPair(merged.top, merged.bottom, page.height);
    marginsDraft = { top, right, bottom, left, orientation, format };
    // La clé n'existe que pour un modèle qui a un filigrane : l'objet d'un modèle sans filigrane ne porte aucune clé en plus.
    const watermark = normalizeWatermark(merged.watermark);
    if (watermark) marginsDraft.watermark = watermark;
    applyToPreviewCss();
  }

  function getOrientation() { return marginsDraft.orientation; }
  function isLandscape() { return marginsDraft.orientation === LANDSCAPE; }
  function getFormat() { return marginsDraft.format; }
  function getFormatLabel() {
    // Le format de la page courante dans les phrases de l'interface (cf. formatLabel) : « A4 », ou « 7 × 3,7 cm » pour un format libre, dans le sens de
    // la page.
    return formatLabel(marginsDraft.format, marginsDraft.orientation);
  }
  function getSheetWidthPx() {
    // Largeur de la feuille à l'écran (px CSS) : celle que `--pp-page-width` donne à la feuille de l'éditeur, à celle de la Lecture et aux espaceurs
    // d'en-tête et de pied (css/editor-v2.css), et que js/main.js lit pour le facteur d'ajustement. L'A4 portrait vaut 793.71
    // (PORTRAIT_SHEET_WIDTH_PX), pas getPageSizePx().width (793.7008) : sa feuille et son facteur d'ajustement ne changent pas d'un centième. Tout
    // autre couple (sens, format) : la largeur de la page en mm, au centième de pixel (A4 paysage 1122.52, A5 portrait 559.37...).
    if (marginsDraft.orientation === PORTRAIT && marginsDraft.format === DEFAULT_FORMAT) return PORTRAIT_SHEET_WIDTH_PX;
    return Math.round(getPageSizePx().width * 100) / 100;
  }

  function announcePageLayoutChanged() {
    // `pp:pageLayoutChanged` : émis seulement quand l'orientation ou le format change réellement (pas à chaque setMarginsMm : charger un modèle
    // l'appelle alors que l'éditeur contient encore le modèle précédent, et js/main.js rafraîchit lui-même juste après avoir posé le nouveau).
    // js/main.js y rafraîchit le facteur d'ajustement, la pagination, la grille des images en calque et la Lecture ; le bouton et le menu
    // (js/orientation-toggle.js) ne rafraîchissent rien eux-mêmes.
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged', { detail: { orientation: marginsDraft.orientation, format: marginsDraft.format } }));
  }
  function setOrientation(orientation) {
    // Change l'orientation en gardant les 4 marges (re-bornées pour la nouvelle page). Ne touche ni à l'aperçu, ni à la pagination, ni aux exports :
    // l'appelant rafraîchit ce qu'il affiche (Editor.refreshLayout) et marque le brouillon modifié (événement pp:marginsChanged, cf. js/settings.js).
    const next = normalizeOrientation(orientation);
    if (next === marginsDraft.orientation) return;
    setMarginsMm(Object.assign({}, marginsDraft, { orientation: next }));
    announcePageLayoutChanged();
  }

  function setFormat(format) {
    // Change le format en gardant le sens et les 4 marges en millimètres (re-bornées pour la nouvelle page, comme au changement de sens : une marge de
    // 100 mm à gauche ne tient plus dans une page A6 de 105 mm, et ne revient pas au retour en A4). Même contrat que setOrientation : ne rafraîchit
    // rien, annonce `pp:pageLayoutChanged` si le format change, l'appelant marque le brouillon modifié (pp:marginsChanged).
    const next = normalizeFormat(format);
    if (next === marginsDraft.format) return;
    setMarginsMm(Object.assign({}, marginsDraft, { format: next }));
    announcePageLayoutChanged();
  }

  function setPageSize(widthMm, heightMm) {
    // Pose la page telle qu'on la saisit : largeur et hauteur en millimètres, dans le sens où on la voit (la fenêtre « Format libre… » ne connaît ni
    // portrait ni paysage). Le plus petit côté devient le format (côté court d'abord, borné, au dixième de mm : cf. formatOf), la page est en paysage
    // quand elle est plus large que haute et garde son sens quand elle est carrée. 21 x 29,7 cm redevient l'A4 : le menu le coche. Les quatre marges
    // sont re-bornées pour la nouvelle page (setMarginsMm) ; sur une petite page (SMALL_PAGE_MM) dont les marges sont encore celles d'origine, elles
    // passent à SMALL_PAGE_MARGIN_MM d'abord. Même contrat que setFormat : ne rafraîchit rien, annonce `pp:pageLayoutChanged` si la page change,
    // l'appelant marque le brouillon modifié (pp:marginsChanged). Rend vrai si quelque chose a changé ; faux, sans rien changer, pour une valeur qui
    // n'est pas un nombre.
    const a = Number(widthMm);
    const b = Number(heightMm);
    if (widthMm === null || heightMm === null || widthMm === '' || heightMm === '' || !Number.isFinite(a) || !Number.isFinite(b)) return false;
    const next = formatOf(dimText(clampDim(Math.min(a, b))) + 'x' + dimText(clampDim(Math.max(a, b))));
    const orientation = a > b ? LANDSCAPE : a < b ? PORTRAIT : marginsDraft.orientation;
    if (next.id === marginsDraft.format && orientation === marginsDraft.orientation) return false;
    const margins = Object.assign({}, marginsDraft, { format: next.id, orientation });
    const untouched = ['top', 'right', 'bottom', 'left'].every(side => Math.abs(marginsDraft[side] - DEFAULT_MARGIN_MM) < 0.05);
    if (next.custom && next.widthMm < SMALL_PAGE_MM && untouched) {
      margins.top = margins.right = margins.bottom = margins.left = SMALL_PAGE_MARGIN_MM;
    }
    setMarginsMm(margins);
    announcePageLayoutChanged();
    return true;
  }

  function fitsHeaderFooter() {
    // La page est-elle assez haute pour recevoir un en-tête ou un pied de page ? Faux sous HEADER_FOOTER_MIN_HEIGHT_MM de haut (un format libre de la
    // taille d'une étiquette) : js/header-footer-preview.js grise alors les zones encore vides, sans toucher à celles qui ont déjà un contenu (on doit
    // pouvoir le retirer).
    return getPageSizeMm().height >= HEADER_FOOTER_MIN_HEIGHT_MM;
  }

  function getWatermark() { return marginsDraft.watermark || null; }
  function setWatermark(value) {
    // Pose (ou retire, avec null ou un texte vide) le filigrane en gardant tout le reste. Même contrat que setOrientation : ne rafraîchit rien, annonce
    // `pp:watermarkChanged` si le filigrane change (js/main.js repeint la pagination et la Lecture), l'appelant marque le brouillon modifié
    // (pp:marginsChanged). Rend vrai si quelque chose a changé.
    const next = normalizeWatermark(value);
    if (JSON.stringify(next) === JSON.stringify(getWatermark())) return false;
    const rest = Object.assign({}, marginsDraft);
    delete rest.watermark;
    setMarginsMm(next ? Object.assign(rest, { watermark: next }) : rest);
    document.dispatchEvent(new CustomEvent('pp:watermarkChanged', { detail: { watermark: getWatermark() } }));
    return true;
  }

  // Page courante (sens et format compris) dans chaque unité des moteurs : mm, pt (pdfmake), px CSS (aperçu, pagination), twip (docx).
  function getPageSizeMm() { return pageSizeMm(marginsDraft.orientation, marginsDraft.format); }
  function getPageSizePt() { const s = getPageSizeMm(); return { width: s.width * MM_TO_PT, height: s.height * MM_TO_PT }; }
  function getPageSizePx() { const s = getPageSizeMm(); return { width: s.width * MM_TO_PX, height: s.height * MM_TO_PX }; }
  function getPageSizeTwip() { const s = getPageSizeMm(); return { width: Math.round(s.width * MM_TO_TWIP), height: Math.round(s.height * MM_TO_TWIP) }; }

  function getContentWidthMm() { return getPageSizeMm().width - marginsDraft.left - marginsDraft.right; }
  function getContentHeightMm() { return getPageSizeMm().height - marginsDraft.top - marginsDraft.bottom; }
  function getColumnGapMm() { return COLUMN_GAP_PX / MM_TO_PX; }

  function getMarginsPt() {
    // `orientation` et `format` voyagent avec les marges : c'est l'objet que js/main.js passe tel quel aux exporteurs (exportCurrentRecord, export en
    // lot), qui n'ont donc aucun autre canal pour apprendre que la page est en paysage, ou en A5.
    const m = marginsDraft;
    const out = { top: m.top * MM_TO_PT, right: m.right * MM_TO_PT, bottom: m.bottom * MM_TO_PT, left: m.left * MM_TO_PT, orientation: m.orientation, format: m.format };
    // Le filigrane voyage avec la page, comme le sens et le format : les exporteurs n'ont aucun autre canal pour l'apprendre.
    if (m.watermark) out.watermark = m.watermark;
    return out;
  }

  function getMarginsPx() {
    // Marges en pixels CSS, même conversion que applyToPreviewCss ci-dessous. Consommées par les deux moteurs de pagination à l'écran
    // (js/header-footer-preview.js, js/reader-mode.js).
    const p = getMarginsPt();
    return { top: p.top * PT_TO_PX, right: p.right * PT_TO_PX, bottom: p.bottom * PT_TO_PX, left: p.left * PT_TO_PX };
  }

  function getMarginsTwip() {
    const m = marginsDraft;
    const out = {
      top: Math.round(m.top * MM_TO_TWIP), right: Math.round(m.right * MM_TO_TWIP),
      bottom: Math.round(m.bottom * MM_TO_TWIP), left: Math.round(m.left * MM_TO_TWIP),
      orientation: m.orientation, format: m.format,
    };
    if (m.watermark) out.watermark = m.watermark;
    return out;
  }

  function applyToPreviewCss() {
    // Posées sur :root (pas #editor-container) : #editor-container et #reader-container sont deux conteneurs frères (l'aperçu paginé en lecture,
    // .v2-page-band-header/.v2-page-break-line etc., n'est scopé à aucun des deux dans le CSS), et une variable custom ne descend que le long de
    // l'arbre DOM ; seul un ancêtre commun aux deux garantit qu'elle soit vue partout où css/editor-v2.css la consomme. `.a4-preview` garde 37.33px
    // comme repli CSS pour tout contexte où ce module n'aurait pas encore tourné (par exemple avant le premier setMarginsMm au chargement).
    const px = getMarginsPx();
    const root = document.documentElement.style;
    root.setProperty('--pp-margin-top', px.top + 'px');
    root.setProperty('--pp-margin-right', px.right + 'px');
    root.setProperty('--pp-margin-bottom', px.bottom + 'px');
    root.setProperty('--pp-margin-left', px.left + 'px');
    // Largeur de la feuille : 793.71px en A4 portrait (la valeur d'avant l'orientation, que css/editor-v2.css garde aussi en repli avant ce premier
    // appel), 1122.52px en A4 paysage, 559.37px en A5 portrait...
    root.setProperty('--pp-page-width', getSheetWidthPx() + 'px');
  }

  function pageNumberText(format, pageNum, totalPages) {
    // Texte d'un numéro de page pour l'un des trois formats du badge .page-number-badge (data-format : 'n', 'page-n', 'n-slash-total'). Pure, et source
    // unique pour l'aperçu paginé (js/header-footer-preview.js), le mode Lecture (js/reader-mode.js) et l'export PDF (js/pdf-export.js) ; l'export DOCX
    // pose de vrais champs PAGE/NUMPAGES (js/docx-export.js).
    if (format === 'page-n') return 'Page ' + pageNum;
    if (format === 'n-slash-total') return pageNum + '/' + totalPages;
    return String(pageNum);
  }
  function resolvePageNumberBadges(html, pageNum, totalPages) {
    // Résout chaque badge .page-number-badge d'un fragment HTML en son texte pour cette page ; renvoie le HTML résolu.
    const host = document.createElement('template'); // inerte : rien ne charge ni ne s'exécute pendant la lecture
    host.innerHTML = html || '';
    host.content.querySelectorAll('.page-number-badge').forEach(badge => {
      badge.textContent = pageNumberText(badge.getAttribute('data-format') || 'n', pageNum, totalPages);
    });
    return host.innerHTML;
  }

  return {
    A4_WIDTH_MM, A4_HEIGHT_MM, MM_TO_PT, MM_TO_TWIP, MM_TO_PX, COLUMN_GAP_PX, MIN_CONTENT_MM, DEFAULT_MARGIN_PT, DEFAULT_MARGIN_MM, PORTRAIT, LANDSCAPE, DEFAULT_FORMAT,
    HEADER_FOOTER_ZONE_PX, HEADER_FOOTER_GAP_PT, HEADER_FOOTER_GAP_PX, HEADER_FOOTER_BAND_PX, hasZoneContent,
    getMarginsMm, setMarginsMm, getContentWidthMm, getContentHeightMm, getColumnGapMm, getMarginsPt, getMarginsPx, getMarginsTwip, applyToPreviewCss,
    getOrientation, isLandscape, setOrientation, getPageSizeMm, getPageSizePt, getPageSizePx, getPageSizeTwip, getSheetWidthPx, pageSizePtFor, pageSizeTwipFor,
    getFormats, getFormat, setFormat, normalizeFormat, pageSizeMmFor, pdfPageNameFor,
    CUSTOM_MIN_MM, CUSTOM_MAX_MM, isCustomFormat, cmText, formatLabel, getFormatLabel, setPageSize, fitsHeaderFooter,
    WATERMARK_MAX_CHARS, WATERMARK_DEFAULT, normalizeWatermark, getWatermark, setWatermark,
    pageNumberText, resolvePageNumberBadges,
  };
})();
