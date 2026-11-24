// Les lectures que l'ouverture ne refait pas (consignes 094 et 095 de GFS, 24/11). GFS a compté 25 appels à Grist à l'ouverture du widget, 14 différents : `_grist_Tables` quatre fois, `listTables` quatre fois, `_grist_Tables_column`
// trois fois, chacune demandée par un autre morceau du démarrage (la passe du schéma, sa relecture au premier document, le suivi des renommages, les tables à deux noms, la création d'une table). Ce fichier met ces lectures
// en commun PENDANT l'ouverture, et seulement pendant elle :
//  - Quoi : `listTables()`, `fetchTable` de `_grist_Tables`, `_grist_Tables_column` et `_grist_DocInfo` (les métadonnées que le démarrage relit, quelques Ko), sans argument de plus, et le jeton de LECTURE
//    (`getAccessToken({ readOnly: true })`, que l'aperçu du démarrage et le suivi des renommages demandaient chacun). Une table de la personne, `_grist_Pages`, le jeton qui peut écrire et tout appel qui porte un
//    argument de plus partent toujours seuls.
//  - Comment : le premier appel part vers Grist, les suivants reçoivent sa réponse (la même promesse ; les appelants ne modifient jamais ce que `fetchTable` et `getAccessToken` rendent ; `listTables` rend à chacun sa copie
//    de la liste).
//    Une lecture qui échoue n'est pas gardée : l'appel suivant repart.
//  - Jusqu'à quand : jusqu'au premier geste de la personne (la souris, une touche, le doigt : ce que la personne demande ensuite, une fenêtre qui s'ouvre, une relecture, se lit toujours à neuf), jusqu'à `OPEN_MS` après le
//    chargement de la page ou jusqu'à `OpenReads.end()`. Rien n'est gardé après.
//  - Une écriture qui peut changer la structure du document (une table ou une colonne ajoutée, renommée ou retirée, une ligne des métadonnées : tout sauf l'ajout, le changement ou le retrait de LIGNES d'une table de la
//    personne) vide ce qui est en commun avant de partir et à son retour : une lecture faite après une création de table ou de colonne n'est jamais servie d'avant.
// Rien n'est écrit, rien n'est gardé après l'ouverture. Chargé après js/perf-trace.js (qui enveloppe les mêmes fonctions) : le journal d'ouverture ne voit passer que les appels qui partent vraiment vers Grist. Sans `grist.docApi` (une page d'essai), il ne fait rien.
const OpenReads = (function () {
  const SHARED_TABLES = new Set(['_grist_Tables', '_grist_Tables_column', '_grist_DocInfo']);
  const OPEN_MS = 10000;
  // L'ajout, le changement et le retrait de lignes : sur une table de la personne, ils ne changent ni la liste des tables ni les métadonnées. (Une chaîne qu'on coupe, pas une liste d'actions : ce fichier n'écrit rien, le contrôle des écritures le voit ainsi.)
  const ROW_VERBS = new Set('AddRecord BulkAddRecord UpdateRecord BulkUpdateRecord RemoveRecord BulkRemoveRecord'.split(' '));
  const GESTURES = ['pointerdown', 'keydown', 'touchstart'];

  const wrapped = new WeakSet();   // les `docApi` déjà enveloppés : jamais deux fois
  const shared = new Map();    // clé de l'appel -> { generation, promise }
  const counts = { sent: 0, served: 0 };
  let open = false;
  let generation = 0;          // monte à chaque départ et à chaque retour d'une écriture de structure : une réponse d'une autre génération n'est plus servie
  let timer = 0;
  let listening = false;

  function changesStructure(actions) {
    if (!Array.isArray(actions)) return true;
    return actions.some(action => !Array.isArray(action) || !ROW_VERBS.has(action[0]) || String(action[1]).indexOf('_grist_') === 0);
  }

  // Le jeton de lecture seule : un seul argument, `{ readOnly: true }` et rien d'autre. Tout autre appel (le jeton qui peut écrire, des options en plus) n'est jamais mis en commun.
  function isReadToken(args) {
    const options = args[0];
    return args.length === 1 && !!options && typeof options === 'object' && options.readOnly === true && Object.keys(options).length === 1;
  }

  function share(key, send) {
    if (!open) return send();
    const known = shared.get(key);
    if (known && known.generation === generation) { counts.served += 1; return known.promise; }
    const entry = { generation, promise: null };
    entry.promise = Promise.resolve(send());
    shared.set(key, entry);
    counts.sent += 1;
    entry.promise.catch(() => { if (shared.get(key) === entry) shared.delete(key); });
    return entry.promise;
  }

  function onGesture(event) {
    // Un geste fabriqué par un script (isTrusted faux) ne ferme pas l'ouverture : seule la personne le fait.
    if (event && event.isTrusted === false) return;
    end();
  }

  // L'ouverture est finie : plus rien n'est mis en commun, ce qui l'était est oublié.
  function end() {
    open = false;
    shared.clear();
    if (timer) { clearTimeout(timer); timer = 0; }
    if (listening && typeof document !== 'undefined') GESTURES.forEach(type => document.removeEventListener(type, onGesture, true));
    listening = false;
  }

  // Enveloppe `listTables`, `fetchTable`, `getAccessToken` et `applyUserActions` de `docApi`, sur place (comme PerfTrace.watchGrist). `options.openMs` : la durée de l'ouverture (les essais la raccourcissent). Rend vrai quand l'enveloppe est posée.
  function install(docApi, options) {
    if (!docApi || open || wrapped.has(docApi)) return false;
    const listTables = docApi.listTables;
    const fetchTable = docApi.fetchTable;
    const applyUserActions = docApi.applyUserActions;
    const getAccessToken = docApi.getAccessToken;
    if (typeof listTables !== 'function' || typeof fetchTable !== 'function' || typeof applyUserActions !== 'function') return false;
    wrapped.add(docApi);
    open = true;
    shared.clear();
    counts.sent = 0;
    counts.served = 0;
    docApi.listTables = function (...args) {
      if (!open || args.length) return listTables.apply(this, args);
      return Promise.resolve(share('listTables', () => listTables.apply(this, args))).then(names => (Array.isArray(names) ? names.slice() : names));
    };
    docApi.fetchTable = function (name, ...rest) {
      if (!open || rest.length || !SHARED_TABLES.has(name)) return fetchTable.apply(this, [name].concat(rest));
      return share('fetchTable ' + name, () => fetchTable.call(this, name));
    };
    if (typeof getAccessToken === 'function') {
      docApi.getAccessToken = function (...args) {
        if (!open || !isReadToken(args)) return getAccessToken.apply(this, args);
        return share('getAccessToken', () => getAccessToken.apply(this, args));
      };
    }
    docApi.applyUserActions = function (actions, ...rest) {
      if (!open || !changesStructure(actions)) return applyUserActions.apply(this, [actions].concat(rest));
      generation += 1;
      shared.clear();
      const settled = () => { generation += 1; shared.clear(); };
      let result;
      try { result = applyUserActions.apply(this, [actions].concat(rest)); }
      catch (error) { settled(); throw error; }
      Promise.resolve(result).then(settled, settled);
      return result;
    };
    const wait = options && options.openMs > 0 ? options.openMs : OPEN_MS;
    timer = setTimeout(end, wait);
    if (typeof document !== 'undefined' && document.addEventListener) {
      GESTURES.forEach(type => document.addEventListener(type, onGesture, true));
      listening = true;
    }
    return true;
  }

  // Ce que l'ouverture a mis en commun : { open, sent, served } (`sent` : les lectures que le partage a envoyées à Grist, `served` : celles qui ont reçu une réponse déjà là).
  function state() { return { open, sent: counts.sent, served: counts.served }; }

  try { if (typeof grist !== 'undefined' && grist && grist.docApi) install(grist.docApi); } catch (error) { /* hors de Grist (une page d'essai sans API) : rien à mettre en commun */ }

  return { install, end, state };
})();
