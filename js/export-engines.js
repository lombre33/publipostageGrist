// Les moteurs d'export (PDF, fusion des PDF, feuilles d'assemblage, Word, Excel et le format des nombres d'Excel : ~380 Ko de scripts) ne se chargent
// qu'au premier besoin, pas à l'ouverture. index.html les déclare en `<script type="text/x-lazy-engine" data-engine="…" src="…">`, une balise par moteur :
// le navigateur ne lit pas ce type, mais les adresses et leur version de cache (`?v=`) restent là où tout l'outillage les cherche. `ensure('pdf')` charge
// le script par le chargeur des exports (ExportCommon.loadScriptOnce : un fichier du dépôt, ou un refus). Un moteur ne se charge qu'une fois, même pour deux
// exports lancés ensemble, et un chargement qui échoue (réseau coupé) se refait à l'appel suivant. Les moteurs ne se lisent pas entre eux : l'ordre où ils
// arrivent n'a pas d'importance.
const ExportEngines = (function () {
  const TAG = 'script[type="text/x-lazy-engine"]';
  const loading = new Map(); // moteur -> sa promesse de chargement, jusqu'à son échec

  function load(engine) {
    const tag = document.querySelector(TAG + '[data-engine="' + engine + '"]');
    if (!tag) return Promise.reject(new Error('Moteur d’export inconnu : ' + engine));
    return ExportCommon.loadScriptOnce({ src: tag.getAttribute('src') });
  }

  function ensureOne(engine) {
    if (!loading.has(engine)) {
      const promise = load(engine);
      loading.set(engine, promise);
      promise.catch(() => loading.delete(engine));
    }
    return loading.get(engine);
  }

  // Charge les moteurs nommés (des noms, ou une liste) ; résolu quand tous sont là.
  function ensure(...engines) {
    return Promise.all(engines.flat().map(ensureOne)).then(() => undefined);
  }

  // Tous ceux que la page déclare : pour ce qui appelle les moteurs sans passer par un export (les bancs d'essai).
  function loadAll() {
    return ensure(Array.from(new Set(Array.from(document.querySelectorAll(TAG), tag => tag.dataset.engine).filter(Boolean))));
  }

  return { ensure, loadAll };
})();
