// Le lien avec Grist Factory Suite (GFS) : ce que le widget en sait quand GFS l'héberge, et rien quand il tourne seul (une fenêtre de Grist qui charge l'adresse de ce dépôt).
// Les messages de GFS ont leur enveloppe (contrats de GFS, section 5) : { gfs: <contrat>, type: 'appel' | 'reponse' | 'erreur' | 'evenement', id, nom, args | data }, sans le `mtype` du
// protocole des widgets de Grist, envoyée au cadre parent avec `targetOrigin "*"` (le sous-cadre d'une app a une origine opaque). Quatre choses seulement :
//  - `contexte`, demandé au démarrage (5 secondes au plus) : les extensions que la personne a activées, la source de chaque bibliothèque qu'elles exigent ({ id: { src, integrite } }),
//    l'adresse du widget dans Grist (`adresseWidget`, sans requête : celle de GFS, que portent les sections de la page, pas celle de cette app qui n'en est que le sous-cadre) et
//    `ouverture`, ce que GFS demande d'ouvrir au démarrage (consigne 010) ;
//  - l'événement `extensions`, quand la personne en active ou en désactive une dans GFS : la même forme ;
//  - `installer`, quand la personne clique une fonction grisée dans GFS : GFS ouvre sa fenêtre d'installation ;
//  - l'appel `ouvrir`, que GFS envoie à l'app déjà ouverte quand la personne double-clique un autre fichier (consigne 010) : l'abonné de `onOpen` répond, ce fichier lui rend la réponse. Tout
//    autre appel de GFS reçoit `GFS_INCONNU` (contrats 5.1, point 3).
// Une app sait qu'elle est hébergée par `gfs=<n>` dans sa propre adresse (<n> : le contrat de GFS), pas par une question : seule, il n'y a ni écouteur ni message, `extensions()` est vide,
// `library()` ne rend rien, `widgetAddress()` rend '' et `opening()` rend null. Un message n'est lu que s'il vient du cadre parent (`event.source`) et porte le contrat de GFS ; l'écouteur est un addEventListener, jamais `window.onmessage =`,
// qui remplacerait celui du script d'API de Grist. Le reste du widget passe par js/extensions.js et js/gfs-open.js, jamais par ce fichier.
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
  let address = '';            // `adresseWidget` du contexte ('' : seul, ou GFS ne l'a pas donnée)
  let opening = null;          // `ouverture` du contexte : null, ou { fichier: null | { id, type }, type, dossier, raison }
  let openHandler = null;      // celui qui s'est inscrit pour l'appel `ouvrir` (onOpen)
  const earlyOpens = [];       // les appels `ouvrir` arrivés avant lui : ils attendent son inscription
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

  // `ouverture` (contrats 5.2, point 3) ou `args` de l'appel `ouvrir` (5.4) : { fichier, type, dossier, raison } où `fichier` est null ou { id, type }, l'`id` pris comme texte (le numéro de
  // ligne du modèle). Rien d'autre n'est gardé ; null quand ce n'est pas un objet.
  function normalizeOpening(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const file = raw.fichier && typeof raw.fichier === 'object' && raw.fichier.id != null && String(raw.fichier.id).trim() !== '' ? raw.fichier : null;
    const text = value => (typeof value === 'string' ? value : '');
    return { fichier: file ? { id: String(file.id).trim(), type: text(file.type) } : null, type: text(raw.type), dossier: text(raw.dossier), raison: text(raw.raison) };
  }

  // Ce que GFS donne (contexte ou événement `extensions`) : une liste d'identifiants, des sources, l'adresse du widget et l'ouverture demandée, rien d'autre n'est gardé. L'événement
  // `extensions` n'a ni adresse ni ouverture : il ne les efface pas.
  function apply(data) {
    if (!data || typeof data !== 'object') return;
    if (typeof data.adresseWidget === 'string' && data.adresseWidget.trim()) address = data.adresseWidget.trim();
    if ('ouverture' in data) opening = normalizeOpening(data.ouverture);
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
    else if (message.type === 'appel') receiveCall(message);
  }

  // La réponse de l'app à un appel de GFS : l'enveloppe porte le contrat de l'app et reprend l'`id` de l'appel.
  function reply(id, fields) {
    try { window.parent.postMessage(Object.assign({ gfs: CONTRACT, id }, fields), '*'); } catch (e) { /* GFS n'est plus là : personne n'attend la réponse */ }
  }

  // Un appel de GFS vers l'app : `ouvrir` va à celui qui s'est inscrit (onOpen), tout autre nom reçoit `GFS_INCONNU` (contrats 5.1, point 3). Un appel sans `id` entier n'attend pas de réponse (point 2).
  function receiveCall(message) {
    const id = Number.isInteger(message.id) ? message.id : null;
    if (message.nom !== 'ouvrir') {
      if (id !== null) reply(id, { type: 'erreur', code: 'GFS_INCONNU', message: 'Appel inconnu : ' + String(message.nom).slice(0, 60) });
      return;
    }
    const call = { id, args: normalizeOpening(message.args) };
    if (openHandler) deliverOpen(call); else earlyOpens.push(call);
  }

  // Donne l'appel `ouvrir` à l'abonné et renvoie sa réponse à GFS : `{ ouvert: true }` si l'abonné rend vrai, `{ ouvert: false }` sinon - et quand il échoue, qui n'a rien ouvert.
  function deliverOpen(call) {
    const answer = opened => { if (call.id !== null) reply(call.id, { type: 'reponse', data: { ouvert: opened === true } }); };
    let result;
    try { result = Promise.resolve(openHandler(call.args)); } catch (e) { result = Promise.reject(e); }
    result.then(answer, (e) => { console.warn('[GfsLink] ouverture demandée par GFS en échec', e); answer(false); });
  }

  // Les extensions que la personne a activées dans GFS, et la source de la bibliothèque `id` ({ src, integrite } ou null).
  const getExtensions = () => extensions.slice();
  const library = id => libraries.get(id) || null;
  // L'adresse du widget dans Grist (sans requête) que GFS a donnée dans le contexte : celle de GFS, que portent les sections de la page. '' seul, si GFS ne répond pas ou ne la donne pas.
  const widgetAddress = () => address;
  // GFS a répondu (le contexte ou un événement est arrivé) : faux seul, et faux tant qu'un GFS qui ne répond pas laisse passer ses 5 secondes.
  const isAnswering = () => known;
  // Ce que GFS demande d'ouvrir au démarrage (`ouverture` du contexte) : null, ou { fichier: null | { id, type }, type, dossier, raison }. null seul, si GFS ne répond pas, ou s'il n'a rien demandé.
  const getOpening = () => opening;
  // Un abonné est rappelé à chaque changement des extensions actives ou de leurs sources, et une fois quand le contexte arrive. Rend de quoi se désabonner.
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  // Inscrit celui qui ouvre ce que GFS demande : `fn({ fichier, type, dossier, raison })` rend (une promesse de) vrai quand le fichier demandé est ouvert à la fin, faux sinon ; GFS en reçoit
  // `{ ouvert }`, sans délai (la personne peut prendre son temps). Un seul abonné ; les appels arrivés avant lui lui sont donnés dans l'ordre.
  function onOpen(fn) {
    openHandler = fn;
    earlyOpens.splice(0).forEach(deliverOpen);
  }

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

  return { hosted, ready, isAnswering, extensions: getExtensions, library, widgetAddress, opening: getOpening, onChange, onOpen, install };
})();
