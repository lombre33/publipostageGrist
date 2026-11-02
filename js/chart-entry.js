// Le graphique de la page et le graphique créé vus du socle du widget. Leur dessin est l'extension « graphique » (extensions/graphique/ : chart-plot.js, chart-source.js, chart-make.js,
// chart-block.js, chart-make-ui.js et leurs feuilles de style), que Grist Factory Suite active ou non et dont les bibliothèques, Plotly pour le graphique de la page et ECharts pour le graphique créé,
// lui viennent de GFS (js/extensions.js, js/gfs-link.js). Ce fichier garde ce qui reste quand l'extension est absente
// et le SEUL point d'entrée par lequel le reste du widget (js/editor-nodes.js, js/main-toolbar.js, js/main.js, js/reader-mode.js) atteint le graphique :
//  - la FORME : le nœud `img.editor-image` et ses attributs `chartSection` (un graphique de la page) ou `chartSpec` (un graphique créé : sa définition, extensions/graphique/chart-make.js),
//    `chartScope` et `chartName` (js/editor-nodes.js) sont ceux d'une image comme les autres, la taille du cadre, le nom de la fonction. Un modèle qui porte un graphique s'ouvre et se
//    réenregistre à l'identique, tous ses attributs compris, avec ou sans l'extension ;
//  - le GRISÉ, sans l'extension : jamais caché. Le cadre de l'éditeur garde son nom et dit pourquoi sous lui (css/chart-frame.css) ; la Lecture et les exports écrivent la note « [Graphique
//    indisponible] » à sa place ; la ligne « Graphique de la page… » du menu est grisée avec sa raison et son clic explique (hébergé par GFS : ouvre sa fenêtre d'installation, seul : une
//    fenêtre simple dit qu'il faut passer par GFS - Extensions.explain) ; la ligne « Créer un graphique… » est grisée de même ;
//  - l'ACTIVATION : le code de l'extension ne se charge qu'au premier usage, et seulement si GFS la dit active ; l'événement `extensions` de GFS fait passer les cadres de l'éditeur de grisés à
//    dessinés et inversement, sans recharger la page.
const ChartEntry = (function () {
  const ID = 'graphique';
  const FEATURE_KEY = 'chart.function';
  const MAKE_FEATURE_KEY = 'chart.make.function';
  const RETRY_AFTER_FAILURE_MS = 30000;

  // L'événement que le cadre d'un graphique envoie (il monte jusqu'à l'éditeur) quand son dessin change : il arrive après coup, sans transaction, et ce qui copie le rendu de l'éditeur - la bande
  // des diapositives (extensions/diapositives/slide-strip.js) - doit le recopier, sans quoi sa miniature garde le cadre pointillé. Envoyé par js/editor-nodes.js (applyImageAttrs).
  const PAINTED_EVENT = 'pp-chart-painted';
  const DEFAULT_WIDTH_PX = 480;   // la taille d'un graphique posé : 8 cm de large environ, de quoi lire les axes sans prendre la page
  const DEFAULT_HEIGHT_PX = 300;
  const MIN_SIDE_PX = 40;
  const MAX_SIDE_PX = 4000;

  // La forme
  // La taille de l'image, en pixels de mise en page : sa largeur et sa hauteur réglées dans l'éditeur (`widthText` et `heightText`, « 480px »), sinon celles d'un graphique posé.
  function sizeFrom(widthText, heightText) {
    const px = value => (/px\s*$/.test(value || '') ? parseFloat(value) : NaN);
    const clamp = value => Math.max(MIN_SIDE_PX, Math.min(MAX_SIDE_PX, Math.round(value)));
    const width = px(widthText);
    const height = px(heightText);
    const wide = width > 0 ? width : DEFAULT_WIDTH_PX;
    return { width: clamp(wide), height: clamp(height > 0 ? height : wide * DEFAULT_HEIGHT_PX / DEFAULT_WIDTH_PX) };
  }
  const sizeOf = img => sizeFrom(img.style.width, img.style.height);
  const sizeOfAttrs = attrs => sizeFrom(attrs && attrs.width, attrs && attrs.height);
  // Les attributs d'un nœud « image » qui en font un graphique : le numéro de la section d'un graphique de la page, ou la définition d'un graphique créé.
  const isChartAttrs = attrs => !!(attrs && (attrs.chartSection || attrs.chartSpec));
  // Un graphique n'a jamais d'image dans le modèle ; une image qui a déjà la sienne (redessinée plus tôt dans le même rendu) est laissée.
  const needsImage = img => !!(img.getAttribute('data-chart-section') || img.getAttribute('data-chart-spec')) && !img.getAttribute('src');
  // Le nœud « image » sélectionné quand c'est un graphique : { node, pos, made }, sinon null. `kind` : 'page' (seulement un graphique de la page), 'made' (seulement un graphique créé), sans : l'un ou l'autre.
  function selectedNode(ed, kind) {
    const node = ed && ed.state.selection.node;
    if (!node || !node.type || node.type.name !== 'editorImage' || node.attrs.src || !isChartAttrs(node.attrs)) return null;
    const made = !!node.attrs.chartSpec;
    if ((kind === 'page' && made) || (kind === 'made' && !made)) return null;
    return { node, pos: ed.state.selection.from, made };
  }
  const isSelected = ed => !!selectedNode(ed, 'page');
  const isMadeSelected = ed => !!selectedNode(ed, 'made');
  // La note qui prend la place d'un graphique à la Lecture et à l'export quand il ne peut pas être dessiné.
  function noteInPlaceOf(img, key) {
    const span = document.createElement('span');
    span.className = 'resolved-var error-msg';
    span.textContent = I18n.t(key);
    img.replaceWith(span);
  }

  // L'état : l'extension est-elle là ?
  const isAvailable = () => Extensions.isActive(ID);
  const isReady = () => isAvailable() && Extensions.isLoaded(ID);
  // Pourquoi la fonction est grisée, dans la langue de l'interface (info-bulle de la ligne du menu et du cadre).
  const reason = () => I18n.t('template.unavailable.extension', { name: Extensions.nameOf(ID) });

  // Dans l'éditeur
  const live = new Map();        // les cadres vivants (l'objet `view` de js/editor-nodes.js) -> de quoi les redessiner
  const delegated = new Set();   // ceux que l'extension dessine
  let loadStarted = false;
  let failedAt = 0;

  function setOff(view, off) {
    view.wrap.classList.toggle('editor-image-chart-off', off);
    if (off) {
      const text = reason();
      view.wrap.title = text;
      view.varLabel.dataset.off = text;
    } else {
      view.wrap.removeAttribute('title');
      delete view.varLabel.dataset.off;
    }
  }
  function releaseDrawing(view) { if (delegated.delete(view)) ChartBlock.releaseFrame(view); }
  function syncFrames() { Array.from(live.values()).forEach(repaint => repaint()); }
  // Charge l'extension pour les cadres déjà posés, puis les redessine ; un échec (réseau coupé) laisse les cadres pointillés, et ne se retente pas à chaque mise à jour d'un cadre.
  function startLoad() {
    if (loadStarted || Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) return;
    loadStarted = true;
    Extensions.ensure(ID).then(syncFrames, (e) => { failedAt = Date.now(); console.warn('[ChartEntry] extension indisponible', e); }).then(() => { loadStarted = false; });
  }

  // Appelée par applyImageAttrs à chaque mise à jour du cadre `view` d'un graphique : rend l'adresse du dessin actuel ('' tant qu'il n'y en a pas ; toujours '' sans l'extension) ;
  // `repaint` remet le cadre à jour quand l'extension arrive, repart ou que le dessin est prêt.
  function paintFrame(view, attrs, repaint) {
    live.set(view, repaint);
    if (!isAvailable()) {
      releaseDrawing(view);
      setOff(view, true);
      return '';
    }
    setOff(view, false);
    if (!isReady()) { startLoad(); return ''; }
    delegated.add(view);
    return ChartBlock.paintFrame(view, attrs, repaint);
  }
  function releaseFrame(view) {
    if (!live.delete(view)) return;
    releaseDrawing(view);
    setOff(view, false);
  }
  // Le clic sur un cadre : son dessin est refait d'après les données d'aujourd'hui.
  function refreshFrame(view) { if (delegated.has(view)) ChartBlock.refreshFrame(view); }
  // Le retour en édition (js/main.js, switchMode) : la Lecture a pu changer de ligne ou de données pendant que les cadres étaient cachés.
  function refreshEditor() { if (delegated.size) ChartBlock.refreshEditor(); }

  // À la Lecture et à l'export
  // Dessine le graphique de `img` pour la ligne `record` (extensions/graphique/chart-block.js) ; sans l'extension, ou si elle ne se charge pas, une note prend sa place. Hébergé par GFS, le
  // contexte peut arriver un instant après l'ouverture : une Lecture qui démarre avant l'attend (5 secondes au plus).
  async function resolveImage(img, tableId, record) {
    if (!needsImage(img)) return;
    await GfsLink.ready;
    if (!isAvailable()) { noteInPlaceOf(img, 'chart.doc.unavailable'); return; }
    try { await Extensions.ensure(ID); }
    catch (e) {
      console.warn('[ChartEntry] extension indisponible', e);
      noteInPlaceOf(img, 'chart.doc.unavailable');
      return;
    }
    await ChartBlock.resolveImage(img, tableId, record);
  }

  // Les lignes « Graphique de la page… » et « Créer un graphique… » du menu. Sans l'extension, elles expliquent (Extensions.explain) ; avec elle, elles ouvrent leur fenêtre (faux quand l'éditeur n'est pas
  // modifiable).
  async function openWith(featureKey, openWindow) {
    if (!isAvailable()) { await Extensions.explain(ID, featureKey); return false; }
    if (!isReady()) {
      try { await Extensions.ensure(ID); }
      catch (e) {
        console.warn('[ChartEntry] extension indisponible', e);
        await Extensions.tellLoadFailed(ID);
        return false;
      }
    }
    return openWindow();
  }
  const open = () => openWith(FEATURE_KEY, () => ChartBlock.open());
  const openMake = () => openWith(MAKE_FEATURE_KEY, () => ChartMakeUi.open());

  Extensions.onChange(syncFrames);

  return {
    DEFAULT_WIDTH_PX, DEFAULT_HEIGHT_PX, PAINTED_EVENT, isAvailable, reason, onChange: Extensions.onChange, sizeOf, sizeOfAttrs, isChartAttrs, needsImage, selectedNode, isSelected, isMadeSelected, noteInPlaceOf,
    paintFrame, releaseFrame, refreshFrame, refreshEditor, resolveImage, open, openMake,
  };
})();
