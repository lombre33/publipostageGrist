// Les extensions du widget : les fonctions lourdes dont le code vit à part, dans extensions/<identifiant>/, et que Grist Factory Suite (GFS) active ou non (guide des apps de GFS, règle 10).
// Le widget seul n'en a aucune : ses fonctions de base marchent sans, et celles d'une extension y sont GRISÉES - jamais cachées, jamais perdues (un modèle qui les porte s'ouvre et se
// réenregistre à l'identique) -, avec la raison au survol et, au clic, une fenêtre qui dit qu'il faut passer par GFS. Hébergé par GFS, le widget apprend du contexte quelles extensions sont
// actives (js/gfs-link.js) : le code d'une extension ne se charge qu'au premier usage, et seulement si elle est active, comme les moteurs d'export (js/export-engines.js).
// Ce registre nomme les fichiers de chaque extension à la place de balises de index.html : le widget seul n'en demande aucun, et l'outil d'audit de GFS ne les compte pas dans sa surface.
// Les bibliothèques d'une extension (Plotly pour le graphique) ne sont ni ici, ni dans la liste ni l'import map du widget : GFS les porte et en donne la source (`library`) ; l'extension dit
// seulement laquelle et en quelle version elle exige. Seule la politique de sécurité du contenu d'index.html garde l'adresse exacte de leur mode CDN (GFS ne peut rien imposer à un sous-cadre).
const Extensions = (function () {
  // Une entrée par extension, dont l'identifiant est celui de GFS (`contexte.extensions`). `version` est la version de cache (?v=) de TOUS les fichiers du dossier : elle monte avec eux.
  const REGISTRY = {
    graphique: {
      nameKey: 'extension.graphique.name',
      version: '0.2',
      scripts: ['chart-plot.js', 'chart-source.js', 'chart-block.js'],
      styles: ['chart-block.css'],
    },
  };

  const loaded = new Set();
  const loading = new Map();   // extension -> sa promesse de chargement, jusqu'à son échec
  const files = new Map();     // adresse d'un fichier -> sa promesse, jusqu'à son échec : un fichier déjà arrivé ne se recharge pas à la reprise d'un échec

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
      ]).then(() => { loaded.add(id); loading.delete(id); });
      loading.set(id, promise);
      promise.catch(() => loading.delete(id));
    }
    return loading.get(id);
  }

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

  return { isKnown, isActive, isLoaded, nameOf, library, widgetAddress, onChange, ensure, loadAll, explain, tellLoadFailed };
})();
