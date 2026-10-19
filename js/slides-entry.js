// Les présentations vues du socle du widget. Une présentation est un modèle du même éditeur que les documents, de type « presentation » (colonne TypeModele), dont la page est une diapositive
// 16:9 (PageLayout.SLIDE_FORMAT, en paysage) : une diapositive est ce qu'il y a entre deux sauts de page. Les présentations sont l'extension « diapositives », que Grist Factory Suite (GFS)
// active ou non (js/extensions.js, js/gfs-link.js) ; elle n'exige aucune bibliothèque, et n'a pas encore de fichier à elle (extensions/diapositives/ accueillera le code propre aux diapositives).
// Ce fichier est le SEUL point d'entrée par lequel le reste du widget (js/main.js, js/main-toolbar.js) l'atteint :
//  - le TYPE : déclaré à js/templates.js avec le nom de l'extension. Extension active, une présentation s'ouvre comme un autre modèle (liste, modèle de la vue, règle de ligne, ouverture
//    demandée par GFS) ; éteinte ou absente, elle reste dans les listes, grisée avec sa raison, jamais ouverte, jamais perdue : son contenu suit les renommages de colonnes et un modèle déjà
//    ouvert s'enregistre toujours sous son type. Une présentation n'est jamais le ★ du document (Templates.canBeDocumentDefault) ;
//  - le GRISÉ, sans l'extension : la ligne « Nouvelle présentation » du menu « + » est grisée avec sa raison, jamais cachée, et son clic explique (hébergé par GFS : ouvre sa fenêtre
//    d'installation, seul : une fenêtre simple dit qu'il faut passer par GFS - Extensions.explain) ;
//  - la PAGE : celle d'une diapositive, pour une présentation vierge et pour une présentation qui n'a pas de format à elle (colonne Margins vide) ;
//  - l'ACTIVATION : « Nouvelle présentation » charge d'abord le code de l'extension (Extensions.ensure, rien tant qu'elle n'a pas de fichier), et seulement si GFS dit l'extension active.
const SlidesEntry = (function () {
  const ID = 'diapositives';
  const TYPE = 'presentation';
  const FEATURE_KEY = 'slides.function';

  let hooks = { startNew: () => {} };

  const isAvailable = () => Extensions.isActive(ID);
  const isPresentation = typeModele => typeModele === TYPE;
  // Pourquoi « Nouvelle présentation » est grisée, dans la langue de l'interface ; '' quand l'extension est active.
  const reason = () => (isAvailable() ? '' : I18n.t('template.unavailable.extension', { name: Extensions.nameOf(ID) }));

  // Posé par js/main.js : `startNew(type)` ouvre un modèle vierge de ce type, avec la question « Enregistrer / Abandonner / Annuler » quand des modifications attendent.
  function setHooks(next) { hooks = Object.assign(hooks, next); }

  // Le geste de la ligne « Nouvelle présentation » : sans l'extension, il explique ; avec elle, le code de l'extension se charge (un échec le dit, le clic suivant réessaie), puis une
  // présentation vierge s'ouvre.
  async function startNew() {
    if (!isAvailable()) { await Extensions.explain(ID, FEATURE_KEY); return; }
    try { await Extensions.ensure(ID); }
    catch (e) {
      console.warn('[SlidesEntry] extension indisponible', e);
      await Extensions.tellLoadFailed(ID);
      return;
    }
    return (await hooks.startNew(TYPE)) === true; // vrai : la présentation vierge est à l'écran (GFS le demande par « Nouveau », js/gfs-open.js)
  }

  // La page d'un modèle de ce type (js/main.js la pose avant son texte, ou le temps de lire celle d'un autre modèle à exporter) : `stored`, celle que sa ligne porte (colonne Margins), ou null pour un modèle vierge. Une présentation qui n'a pas de
  // format à elle (vierge, ou Margins vide) prend la diapositive 16:9 (33,87 x 19,05 cm, le format « grand écran » de PowerPoint) en paysage, avec ses marges ; un format choisi au menu de la page
  // est gardé. Tout autre type garde la sienne (null : la page par défaut).
  function pageFor(typeModele, stored) {
    if (!isPresentation(typeModele) || (stored && stored.format)) return stored || null;
    return Object.assign({}, stored, { orientation: PageLayout.LANDSCAPE, format: PageLayout.SLIDE_FORMAT });
  }

  Templates.declareExtensionType(TYPE, Extensions.nameOf(ID), isAvailable);

  return { ID, TYPE, FEATURE_KEY, setHooks, isAvailable, reason, startNew, pageFor, onChange: Extensions.onChange };
})();
