// Les présentations vues du socle du widget. Une présentation est un modèle du même éditeur que les documents, de type « presentation » (colonne TypeModele), dont la page est une diapositive
// 16:9 (PageLayout.SLIDE_FORMAT, en paysage) : une diapositive est ce qu'il y a entre deux sauts de page. Les présentations sont l'extension « diapositives », que Grist Factory Suite (GFS)
// active ou non (js/extensions.js, js/gfs-link.js) ; elle n'exige aucune bibliothèque, et son code (extensions/diapositives/) est la bande des diapositives.
// Ce fichier est le SEUL point d'entrée par lequel le reste du widget (js/main.js, js/main-toolbar.js) l'atteint :
//  - le TYPE : déclaré à js/templates.js avec le nom de l'extension. Extension active, une présentation s'ouvre comme un autre modèle (liste, modèle de la vue, règle de ligne, ouverture
//    demandée par GFS) ; éteinte ou absente, elle reste dans les listes, grisée avec sa raison, jamais ouverte, jamais perdue : son contenu suit les renommages de colonnes et un modèle déjà
//    ouvert s'enregistre toujours sous son type. Une présentation n'est jamais le ★ du document (Templates.canBeDocumentDefault) ;
//  - le GRISÉ, sans l'extension : la ligne « Nouvelle présentation » du menu « + » est grisée avec sa raison, jamais cachée, et son clic explique (hébergé par GFS : ouvre sa fenêtre
//    d'installation, seul : une fenêtre simple dit qu'il faut passer par GFS - Extensions.explain) ;
//  - la PAGE : celle d'une diapositive, pour une présentation vierge et pour une présentation qui n'a pas de format à elle (colonne Margins vide) ;
//  - l'ACTIVATION : « Nouvelle présentation » charge d'abord le code de l'extension (Extensions.ensure), et seulement si GFS dit l'extension active ; un modèle de présentation
//    de la galerie de même (ensureFor), ses boutons grisés avec leur raison sans l'extension (unavailableReason) ;
//  - la BANDE DES DIAPOSITIVES (extensions/diapositives/slide-strip.js) : à gauche du document tant qu'une présentation est à l'écran en Édition. Son code se charge au premier besoin, et
//    seulement si GFS dit l'extension active ; un échec (réseau coupé) laisse la présentation s'écrire sans bande et se retente au prochain changement d'écran. GFS éteint l'extension
//    pendant qu'une présentation est ouverte : la bande reste, ses gestes grisés avec leur raison, et leur clic explique ;
//  - la PAGE DE CHAQUE DIAPOSITIVE, même vide, la dernière comprise (carte du 19/10, « Tout de suite ») : un saut de page qui termine une présentation ouvre sa page, comme une
//    diapositive vide au milieu, alors qu'il n'en ouvre pas à la fin d'un document (carte du 14/10, « Cacher dans l'éditeur »). À l'écran, la pagination le demande ici
//    (showsEveryPage) ; la Lecture et les exports le lisent dans le HTML de la présentation (outputHtml). Son PDF ne demande jamais « Exporter quand même ? » pour une page
//    blanche (carte du 19/10, « Ne plus avertir ») : js/main.js le dit à js/pdf-export.js (showsEveryPage), un document gardant la question.
const SlidesEntry = (function () {
  const ID = 'diapositives';
  const TYPE = 'presentation';
  const FEATURE_KEY = 'slides.function';
  const RETRY_AFTER_FAILURE_MS = 30000;
  const SLIDE_BREAK_ATTR = 'data-slide-break';

  let hooks = { startNew: () => {}, relayout: () => {}, status: () => {} };
  // Posé par js/main.js : ce que l'écran montre ({ type, editing }) ; `editing` est vrai quand l'éditeur est visible en Édition et modifiable.
  let context = () => ({ type: 'document', editing: false });
  let strip = null;            // la bande, que l'extension pose une fois chargée (register)
  let loadStarted = false;
  let failedAt = 0;

  const isAvailable = () => Extensions.isActive(ID);
  const isPresentation = typeModele => typeModele === TYPE;
  // Pourquoi « Nouvelle présentation » est grisée, dans la langue de l'interface ; '' quand l'extension est active.
  const reason = () => (isAvailable() ? '' : I18n.t('template.unavailable.extension', { name: Extensions.nameOf(ID) }));

  // Posé par js/main.js : `startNew(type)` ouvre un modèle vierge de ce type, avec la question « Enregistrer / Abandonner / Annuler » quand des modifications attendent ; `relayout()` refait
  // l'ajustement de la page et sa pagination quand la bande prend ou rend sa place à gauche du document ; `status(message, isError)` écrit dans le coin d'état (« Diapositive 3 copiée. »).
  function setHooks(next) { hooks = Object.assign(hooks, next); }
  function setContext(fn) { context = fn; }

  // Le geste de la ligne « Nouvelle présentation » : sans l'extension, il explique ; avec elle, le code de l'extension se charge (un échec le dit, le clic suivant réessaie), puis une
  // présentation vierge s'ouvre.
  async function startNew() {
    if (!(await ensureFor(TYPE))) return;
    return (await hooks.startNew(TYPE)) === true; // vrai : la présentation vierge est à l'écran (GFS le demande par « Nouveau », js/gfs-open.js)
  }
  // Avant d'ouvrir un modèle de type `typeModele` qui n'existe pas encore (« Nouvelle présentation », un modèle de la galerie, js/template-gallery-modal.js) : vrai pour tout
  // autre type. Pour une présentation, sans l'extension, le geste explique et rend faux ; avec elle, son code se charge d'abord (un échec le dit et rend faux, le clic suivant
  // réessaie).
  async function ensureFor(typeModele) {
    if (!isPresentation(typeModele)) return true;
    if (!isAvailable()) { await Extensions.explain(ID, FEATURE_KEY); return false; }
    try { await Extensions.ensure(ID); return true; }
    catch (e) {
      console.warn('[SlidesEntry] extension indisponible', e);
      await Extensions.tellLoadFailed(ID);
      return false;
    }
  }
  // Pourquoi un geste qui ouvrirait un modèle de type `typeModele` est grisé (la galerie, pour un modèle de présentation) ; '' quand il ne l'est pas.
  const unavailableReason = typeModele => (isPresentation(typeModele) ? reason() : '');

  // La page d'un modèle de ce type (js/main.js la pose avant son texte, ou le temps de lire celle d'un autre modèle à exporter) : `stored`, celle que sa ligne porte (colonne Margins), ou null pour un modèle vierge. Une présentation qui n'a pas de
  // format à elle (vierge, ou Margins vide) prend la diapositive 16:9 (33,87 x 19,05 cm, le format « grand écran » de PowerPoint) en paysage, avec ses marges ; un format choisi au menu de la page
  // est gardé. Tout autre type garde la sienne (null : la page par défaut).
  function pageFor(typeModele, stored) {
    if (!isPresentation(typeModele) || (stored && stored.format)) return stored || null;
    return Object.assign({}, stored, { orientation: PageLayout.LANDSCAPE, format: PageLayout.SLIDE_FORMAT });
  }

  // La bande des diapositives
  // Montrée quand une présentation est à l'écran en Édition, que son code est là (fichiers et feuille de style arrivés) ; cachée sinon. Rappelée par js/main.js à chaque changement de ce
  // que l'écran montre (modèle, mode, droits) et par GFS quand il allume ou éteint une extension.
  function sync() {
    const shown = context();
    if (!(isPresentation(shown.type) && shown.editing)) { if (strip) strip.hide(); return; }
    if (strip && Extensions.isLoaded(ID)) { strip.show({ off: !isAvailable() }); return; }
    if (isAvailable()) startLoad();
  }
  function startLoad() {
    if (loadStarted || Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) return;
    loadStarted = true;
    Extensions.ensure(ID).then(sync, (e) => { failedAt = Date.now(); console.warn('[SlidesEntry] extension indisponible', e); }).then(() => { loadStarted = false; });
  }
  // La page de chaque diapositive
  // Vrai pour une présentation (`typeModele`, par défaut celle que montre l'éditeur) : chacune de ses pages est une diapositive, voulue même vide. Sa pagination ouvre la page
  // d'un saut de page qui termine le texte (js/header-footer-preview.js:trailingBlankStart), et son PDF ne signale aucune page blanche (js/main.js le passe à js/pdf-export.js).
  const showsEveryPage = (typeModele = context().type) => isPresentation(typeModele);
  // Une présentation est-elle le modèle que montre l'éditeur ? Les diapositives liées ne se synchronisent et ne se gardent que là (js/slide-links.js).
  const presentationShown = () => isPresentation(context().type);
  // Le HTML d'un modèle de type `typeModele` tel que la Lecture et les exports le reçoivent (js/main.js : celui de l'écran, celui d'un autre modèle d'un lot). Celui d'une présentation
  // marque ses sauts de page `data-slide-break` : ReaderMode.trimTrailingBlankBlocks ne retire jamais un tel saut, ni la première ligne de la page qu'il ouvre. Un texte qui finit sur un
  // saut de page reçoit cette ligne, sans quoi la page ne s'ouvrirait pas (le PDF ouvre une page avec le bloc qui suit le saut). Le modèle enregistré n'est jamais touché.
  function outputHtml(typeModele, html) {
    if (!isPresentation(typeModele) || !html) return html;
    // Le repère d'une diapositive liée n'en sort jamais, et une diapositive que seule sa source a changée prend celle de la source (js/slide-links.js:forOutput).
    html = SlideLinks.forOutput(html);
    const host = Dom.inertTemplate(html);
    const blocks = Array.from(host.content.children);
    const breaks = blocks.filter(block => block.classList.contains('page-break-marker'));
    if (!breaks.length) return html;
    breaks.forEach(block => block.setAttribute(SLIDE_BREAK_ATTR, ''));
    if (blocks[blocks.length - 1].classList.contains('page-break-marker')) host.content.appendChild(document.createElement('p'));
    return host.innerHTML;
  }

  // Posé par l'extension à son chargement (extensions/diapositives/slide-strip.js) : { show({ off }), hide() }. Elle ne se montre qu'une fois tous ses fichiers arrivés (sync).
  function register(next) { strip = next; }
  // Un geste grisé de la bande, l'extension éteinte : hébergé par GFS, sa fenêtre d'installation ; seul, la fenêtre qui dit qu'il faut passer par GFS.
  const explainOff = () => Extensions.explain(ID, FEATURE_KEY);
  const relayout = () => hooks.relayout();
  const status = (message, isError) => hooks.status(message, isError);

  Templates.declareExtensionType(TYPE, Extensions.nameOf(ID), isAvailable);
  Extensions.onChange(sync);

  return {
    ID, TYPE, FEATURE_KEY, SLIDE_BREAK_ATTR, setHooks, setContext, isAvailable, reason, startNew, ensureFor, unavailableReason, pageFor, onChange: Extensions.onChange,
    changed: sync, register, explainOff, relayout, status, showsEveryPage, presentationShown, outputHtml,
  };
})();
