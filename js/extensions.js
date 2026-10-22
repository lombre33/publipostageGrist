// Les extensions du widget : les fonctions lourdes dont le code vit à part, dans extensions/<identifiant>/, et que Grist Factory Suite (GFS) active ou non (guide des apps de GFS, règle 10).
// Le widget seul n'en a aucune : ses fonctions de base marchent sans, et celles d'une extension y sont GRISÉES - jamais cachées, jamais perdues (un modèle qui les porte s'ouvre et se
// réenregistre à l'identique) -, avec la raison au survol et, au clic, une fenêtre qui dit qu'il faut passer par GFS. Hébergé par GFS, le widget apprend du contexte quelles extensions sont
// actives (js/gfs-link.js) : le code d'une extension ne se charge qu'au premier usage, et seulement si elle est active, comme les moteurs d'export (js/export-engines.js).
// Ce registre nomme les fichiers de chaque extension à la place de balises de index.html : le widget seul n'en demande aucun, et l'outil d'audit de GFS ne les compte pas dans sa surface.
// Les bibliothèques d'une extension (Plotly pour le graphique, le fichier « edition-live » de l'écriture en direct) ne sont ni ici, ni dans la liste ni l'import map du widget : GFS les porte et en
// donne la source (`library`) ; l'extension dit seulement laquelle et en quelle version elle exige. Seule la politique de sécurité du contenu d'index.html garde l'adresse exacte de leur mode CDN (GFS ne
// peut rien imposer à un sous-cadre). Une bibliothèque de forme « module » (le fichier assemblé de l'écriture en direct, contrats de GFS 2.6 point 8) se charge par `loadModuleLibrary`.
const Extensions = (function () {
  // Une entrée par extension, dont l'identifiant est celui de GFS (`contexte.extensions`). `version` est la version de cache (?v=) de TOUS les fichiers du dossier : elle monte avec eux.
  const REGISTRY = {
    graphique: {
      nameKey: 'extension.graphique.name',
      version: '0.2',
      scripts: ['chart-plot.js', 'chart-source.js', 'chart-block.js'],
      styles: ['chart-block.css'],
    },
    // L'écriture en direct du texte d'un modèle (extensions/edition/). Ses fichiers ne dépendent pas de leur ordre d'arrivée : aucun n'appelle un autre avant que l'extension soit chargée.
    // `libraries` : le fichier de GFS qu'elle exige, chargé avec elle (`id` et `forme` de la bibliothèque) ; il fait partie du chargement : s'il est refusé, l'extension ne se charge pas.
    edition: {
      nameKey: 'extension.edition.name',
      version: '0.2',
      scripts: ['live-sync.js', 'live-channel.js', 'live-editor.js', 'live-control.js'],
      styles: ['live.css'],
      libraries: [{ id: 'edition-live', forme: 'module' }],
    },
    // Les présentations (entrée unique js/slides-entry.js) : un modèle de type « presentation », du même éditeur que les documents, sans bibliothèque. Son code est ce qui est propre aux
    // diapositives : la bande des miniatures à gauche du document (extensions/diapositives/slide-strip.js), le volet « Importer » à droite (slide-import.js), ce que la personne voit
    // des diapositives liées (slide-links-ui.js : la fenêtre « Demander », les lignes du lien ; le lien lui-même est dans le socle, js/slide-links.js), « Objets » sous les miniatures
    // (slide-objects.js : les cadres de texte libres, les formes et les lignes, que le socle sait fabriquer, js/free-frame.js et js/shape-geometry.js), la fenêtre « Transition… » et les effets (slide-transitions-ui.js, slide-transitions.js ; la
    // transition elle-même est un repère du socle, js/slide-props.js), la fenêtre « Fond… » (slide-background-ui.js ; le fond aussi est dans ce repère) et « Présenter », le diaporama (slide-show.js), chargés quand une présentation est à l'écran. Ses fichiers ne dépendent pas de leur ordre d'arrivée : chacun n'appelle l'autre qu'une fois l'extension
    // chargée.
    diapositives: {
      nameKey: 'extension.diapositives.name',
      version: '0.21',
      scripts: ['slide-strip.js', 'slide-import.js', 'slide-objects.js', 'slide-links-ui.js', 'slide-transitions.js', 'slide-transitions-ui.js', 'slide-background-ui.js', 'slide-show.js'],
      styles: ['slide-strip.css', 'slide-import.css', 'slide-objects.css', 'slide-transitions.css', 'slide-background.css', 'slide-show.css'],
    },
  };

  const loaded = new Set();
  const loading = new Map();   // extension -> sa promesse de chargement, jusqu'à son échec
  const files = new Map();     // adresse d'un fichier -> sa promesse, jusqu'à son échec : un fichier déjà arrivé ne se recharge pas à la reprise d'un échec
  const failures = new Map();  // extension -> l'erreur de son dernier chargement raté, jusqu'à ce qu'un chargement réussisse
  const moduleLibraries = new Map();   // adresse + empreinte d'une bibliothèque de forme « module » -> sa promesse ({ version, modules }), jusqu'à son échec
  const moduleAttempts = new Map();    // adresse -> le nombre de chargements commencés, quelle que soit l'empreinte (une reprise change l'adresse d'une question, voir loadModuleLibrary)

  const isKnown = id => Object.prototype.hasOwnProperty.call(REGISTRY, id);
  // L'extension est active quand GFS l'a dit : seule, aucune ne l'est.
  const isActive = id => isKnown(id) && GfsLink.extensions().indexOf(id) !== -1;
  const isLoaded = id => loaded.has(id);
  // Son nom, dans la langue de l'interface.
  const nameOf = id => (isKnown(id) ? I18n.t(REGISTRY[id].nameKey) : String(id));
  // La source { src, integrite } que GFS donne de la bibliothèque `id`, ou null.
  const library = id => GfsLink.library(id);
  // L'adresse du widget dans Grist (sans requête) que GFS donne dans son contexte, ou '' : seul, ou si GFS ne la donne pas.
  const widgetAddress = () => GfsLink.widgetAddress();
  const onChange = fn => GfsLink.onChange(fn);

  function loadStyle(href) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => { link.remove(); reject(new Error('Échec de chargement de la feuille de style : ' + href)); };
      document.head.appendChild(link);
    });
  }
  const loadScript = src => ExportCommon.loadScriptOnce({ src });

  function loadFile(url, loader) {
    if (!files.has(url)) {
      const promise = loader(url);
      files.set(url, promise);
      promise.catch(() => files.delete(url));
    }
    return files.get(url);
  }

  // Charge la bibliothèque de forme « module » que GFS donne sous `id` (le fichier assemblé d'une extension, contrats de GFS 2.6 points 8 et 9, 5.2 point 4) : par <script type="module" src integrity
  // crossorigin="anonymous">, jamais par import() qui n'accepte aucune empreinte ; une fois chargé, le fichier a posé globalThis.GfsPaquets[id] = { version, modules }. Résolu avec cet objet. Rejeté,
  // avec la raison, quand GFS ne la donne pas, qu'elle n'est pas de forme module, qu'il manque son empreinte, que le fichier est refusé (empreinte fausse, origine non permise, réseau coupé, politique de
  // sécurité du contenu) ou qu'il ne pose rien. Les bibliothèques d'un module partagent la fenêtre : charger deux fois la même adresse n'exécute le fichier qu'une fois.
  function loadModuleLibrary(id) {
    const source = library(id);
    if (!source) return Promise.reject(new Error('Bibliothèque absente : GFS ne donne pas « ' + id + ' »'));
    if (source.forme !== 'module') return Promise.reject(new Error('Bibliothèque « ' + id + ' » : GFS la donne en forme « ' + source.forme + ' », pas en forme « module »'));
    if (!/^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(String(source.integrite || ''))) return Promise.reject(new Error('Bibliothèque « ' + id + ' » : empreinte absente ou illisible'));
    const refusal = ExportCommon.scriptRefusal({ src: source.src, integrity: source.integrite });
    if (refusal) return Promise.reject(new Error('Bibliothèque « ' + id + ' » refusée (' + refusal + ')'));
    const key = source.src + ' ' + source.integrite;
    if (!moduleLibraries.has(key)) {
      // Un fichier de forme « module » dont le chargement a raté (réseau coupé un instant, empreinte fausse que GFS corrige ensuite) reste « raté » pour cette adresse tant que la page vit : le navigateur
      // garde l'échec, sans regarder l'empreinte. La reprise (le clic suivant) change donc l'adresse d'une question (?r=<n>), que GFS, qui sert un fichier, ignore ; la première tentative garde l'adresse exacte de GFS.
      const attempt = moduleAttempts.get(source.src) || 0;
      moduleAttempts.set(source.src, attempt + 1);
      let address = source.src;
      if (attempt) { const url = new URL(source.src, document.baseURI); url.searchParams.set('r', String(attempt)); address = url.href; }
      // Le chargeur de script est celui de tout le widget (ExportCommon.loadScriptOnce) : une balise <script type="module" src integrity crossorigin="anonymous">.
      const promise = ExportCommon.loadScriptOnce({ src: address, integrity: source.integrite, type: 'module' }).then(
        () => {
          const given = moduleGiven(id);
          if (given) return given;
          throw new Error('Bibliothèque « ' + id + ' » chargée mais elle ne pose rien sous GfsPaquets');
        },
        () => { throw new Error('Bibliothèque « ' + id + ' » : le fichier n\'a pas pu être chargé (empreinte, réseau ou politique de sécurité)'); },
      );
      moduleLibraries.set(key, promise);
      promise.catch(() => moduleLibraries.delete(key));
    }
    return moduleLibraries.get(key);
  }
  // Ce que le fichier assemblé `id` a posé ({ version, modules }), ou null tant qu'il n'a rien posé de lisible.
  function moduleGiven(id) {
    const packages = globalThis.GfsPaquets;
    const given = packages && Object.prototype.hasOwnProperty.call(packages, id) ? packages[id] : null;
    return given && given.modules && typeof given.modules === 'object' ? given : null;
  }
  // Les espaces de noms d'une bibliothèque de forme « module » déjà chargée (`modules['yjs']`...), ou null.
  function moduleNamespaces(id) {
    const given = moduleGiven(id);
    return given ? given.modules : null;
  }

  // Charge le code de l'extension `id` ; résolu quand tous ses fichiers sont là. Rejeté si elle est inconnue, inactive ou qu'un fichier ne charge pas (réessayé à l'appel suivant).
  function ensure(id) {
    if (!isKnown(id)) return Promise.reject(new Error('Extension inconnue : ' + id));
    if (!isActive(id)) return Promise.reject(new Error('Extension inactive : ' + id));
    if (loaded.has(id)) return Promise.resolve();
    if (!loading.has(id)) {
      const entry = REGISTRY[id];
      const base = 'extensions/' + id + '/';
      const query = '?v=' + entry.version;
      const promise = Promise.all([
        ...entry.scripts.map(file => loadFile(base + file + query, loadScript)),
        ...entry.styles.map(file => loadFile(base + file + query, loadStyle)),
        ...(entry.libraries || []).map(lib => loadModuleLibrary(lib.id)),
      ]).then(() => { loaded.add(id); loading.delete(id); failures.delete(id); });
      loading.set(id, promise);
      promise.catch((e) => { loading.delete(id); failures.set(id, e); });
    }
    return loading.get(id);
  }
  // Pourquoi le dernier chargement de l'extension `id` a raté (le message de l'erreur), ou '' quand il n'a pas raté ou que l'extension s'est chargée depuis.
  const failureOf = id => (failures.has(id) ? String(failures.get(id).message || failures.get(id)) : '');

  // Toutes les extensions actives : pour ce qui appelle leur code sans passer par un usage (les bancs d'essai, comme ExportEngines.loadAll).
  function loadAll() { return Promise.all(Object.keys(REGISTRY).filter(isActive).map(ensure)).then(() => undefined); }

  // Le clic sur une fonction grisée de l'extension `id`. Hébergé par GFS (et GFS répond), il ouvre la fenêtre d'installation de GFS ; seul, ou si GFS ne répond pas (l'appel `installer` n'a pas
  // de délai : il attend la personne), une fenêtre simple dit qu'il faut passer par GFS pour s'en servir. `featureKey` : la clé du nom de la fonction. Résolu quand la fenêtre est fermée.
  async function explain(id, featureKey) {
    if (GfsLink.hosted && GfsLink.isAnswering()) {
      try { await GfsLink.install(id); return; } catch (e) { console.warn('[Extensions] installation indisponible', e); }
    }
    await Dialogs.notice({
      title: I18n.t('extension.off.title'),
      message: I18n.t('extension.off.message', { feature: I18n.t(featureKey), extension: nameOf(id) }),
      closeLabel: I18n.t('common.close'),
    });
  }

  // Le code de l'extension n'a pas pu être chargé (réseau coupé) : la fenêtre le dit, la fonction se réessaie au clic suivant.
  function tellLoadFailed(id) {
    return Dialogs.notice({
      title: I18n.t('extension.failed.title'),
      message: I18n.t('extension.failed.message', { extension: nameOf(id) }),
      closeLabel: I18n.t('common.close'),
    });
  }

  return { isKnown, isActive, isLoaded, nameOf, library, widgetAddress, onChange, ensure, failureOf, loadModuleLibrary, moduleNamespaces, loadAll, explain, tellLoadFailed };
})();
