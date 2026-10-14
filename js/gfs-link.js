// Le lien avec Grist Factory Suite (GFS) : ce que le widget en sait quand GFS l'héberge, et rien quand il tourne seul (une fenêtre de Grist qui charge l'adresse de ce dépôt).
// Les messages de GFS ont leur enveloppe (contrats de GFS, section 5) : { gfs: <contrat>, type: 'appel' | 'reponse' | 'erreur' | 'evenement', id, nom, args | data }, sans le `mtype` du
// protocole des widgets de Grist, envoyée au cadre parent avec `targetOrigin "*"` (le sous-cadre d'une app a une origine opaque). Trois choses seulement :
//  - `contexte`, demandé au démarrage (5 secondes au plus) : les extensions que la personne a activées et la source de chaque bibliothèque qu'elles exigent ({ id: { src, integrite } }) ;
//  - l'événement `extensions`, quand la personne en active ou en désactive une dans GFS : la même forme ;
//  - `installer`, quand la personne clique une fonction grisée dans GFS : GFS ouvre sa fenêtre d'installation.
// Une app sait qu'elle est hébergée par `gfs=<n>` dans sa propre adresse (<n> : le contrat de GFS), pas par une question : seule, il n'y a ni écouteur ni message, `extensions()` est vide
// et `library()` ne rend rien. Un message n'est lu que s'il vient du cadre parent (`event.source`) et porte le contrat de GFS ; l'écouteur est un addEventListener, jamais `window.onmessage =`,
// qui remplacerait celui du script d'API de Grist. Le reste du widget passe par js/extensions.js, jamais par ce fichier.
const GfsLink = (function () {
  const CONTRACT = 0;                // le contrat que parle l'app, celui de son manifeste
  const CONTEXT_TIMEOUT_MS = 5000;   // contrats 5.1, point 4 : l'app attend `contexte` 5 secondes au plus
  const ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

  const hostContract = (function () {
    try {
      const raw = new URLSearchParams(window.location.search).get('gfs');
      return /^\d{1,6}$/.test(raw || '') ? Number(raw) : null;
    } catch (e) { return null; }
  })();
  const hosted = hostContract !== null;

  let extensions = [];
  let libraries = new Map();   // identifiant -> { src, integrite }
  let known = false;           // le contexte (ou un événement) est arrivé
  const listeners = new Set();
  const pending = new Map();   // id d'appel -> { resolve, reject }
  const installing = new Map();
  let nextId = 1;
  let settleReady;
  // Résolue quand le contexte est arrivé ou que ses 5 secondes sont passées (jamais rejetée) : tout de suite quand l'app est seule.
  const ready = new Promise((resolve) => { settleReady = resolve; });

  function call(name, args, timeoutMs) {
    return new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      let timer = 0;
      const done = fn => (value) => { clearTimeout(timer); pending.delete(id); fn(value); };
      pending.set(id, { resolve: done(resolve), reject: done(reject) });
      if (timeoutMs) timer = setTimeout(() => done(reject)(new Error('GFS ne répond pas : ' + name)), timeoutMs);
      const message = { gfs: CONTRACT, type: 'appel', id, nom: name };
      if (args !== undefined) message.args = args;
      try { window.parent.postMessage(message, '*'); } catch (e) { done(reject)(e); }
    });
  }

  // Ce que GFS donne (contexte ou événement `extensions`) : une liste d'identifiants et des sources, rien d'autre n'est gardé.
  function apply(data) {
    if (!data || typeof data !== 'object') return;
    const nextExtensions = (Array.isArray(data.extensions) ? data.extensions : []).filter(id => typeof id === 'string' && ID_PATTERN.test(id));
    const nextLibraries = new Map();
    const given = data.bibliotheques && typeof data.bibliotheques === 'object' ? data.bibliotheques : {};
    Object.keys(given).forEach((id) => {
      const lib = given[id];
      if (ID_PATTERN.test(id) && lib && typeof lib.src === 'string' && typeof lib.integrite === 'string') nextLibraries.set(id, { src: lib.src, integrite: lib.integrite });
    });
    const changed = !known || JSON.stringify([extensions, Array.from(libraries)]) !== JSON.stringify([nextExtensions, Array.from(nextLibraries)]);
    extensions = nextExtensions;
    libraries = nextLibraries;
    known = true;
    if (changed) listeners.forEach((fn) => { try { fn(); } catch (e) { console.warn('[GfsLink] abonné en échec', e); } });
  }

  function onMessage(event) {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || message.gfs !== hostContract) return;
    if (message.type === 'reponse' || message.type === 'erreur') {
      const entry = pending.get(message.id);
      if (!entry) return;
      if (message.type === 'reponse') entry.resolve(message.data);
      else entry.reject(new Error(String(message.message || message.code || 'erreur de GFS')));
    } else if (message.type === 'evenement' && message.nom === 'extensions') apply(message.data);
  }

  // Les extensions que la personne a activées dans GFS, et la source de la bibliothèque `id` ({ src, integrite } ou null).
  const getExtensions = () => extensions.slice();
  const library = id => libraries.get(id) || null;
  // GFS a répondu (le contexte ou un événement est arrivé) : faux seul, et faux tant qu'un GFS qui ne répond pas laisse passer ses 5 secondes.
  const isAnswering = () => known;
  // Un abonné est rappelé à chaque changement des extensions actives ou de leurs sources, et une fois quand le contexte arrive. Rend de quoi se désabonner.
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  // Ouvre, dans GFS, la fenêtre d'installation de l'extension `extension` (un clic sur une fonction grisée). Rend les extensions actives après le choix de la personne ; l'événement
  // `extensions` suit si elle en a activé une. Deux clics pendant que la fenêtre est ouverte ne posent qu'une demande.
  function install(extension) {
    if (!hosted) return Promise.reject(new Error('GFS absent'));
    if (!installing.has(extension)) {
      const request = call('installer', { extension }).then(data => (data && Array.isArray(data.actives) ? data.actives : []));
      installing.set(extension, request);
      const settled = () => installing.delete(extension);
      request.then(settled, settled);
    }
    return installing.get(extension);
  }

  if (hosted) {
    window.addEventListener('message', onMessage);
    call('contexte', undefined, CONTEXT_TIMEOUT_MS).then(apply, e => console.warn('[GfsLink] contexte indisponible', e)).then(settleReady);
  } else settleReady();

  return { hosted, ready, isAnswering, extensions: getExtensions, library, onChange, install };
})();
