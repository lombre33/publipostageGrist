// Un Grist Factory Suite (GFS) simulé pour les tests : la page de test s'ouvre avec `?gfs=0` dans son adresse (« hébergée », contrats de GFS 1.3 point 3) et ce script répond à la place de GFS.
// Posé AVANT les scripts de la page (page.addInitScript) : js/gfs-link.js demande le contexte dès son chargement. Comme la page de test est une fenêtre de premier niveau
// (`window.parent === window`), ce que le widget envoie à son parent est `window.postMessage` : le stub le prend au passage (il remplace cette méthode pour les enveloppes de GFS, sans les renvoyer
// au widget : un vrai parent ne lui rend pas ses propres appels) et répond dans la même fenêtre (`event.source === window.parent` y est vrai).
// Il joue le rôle de GFS que le widget ne peut pas jouer lui-même : la liste des extensions actives et la SOURCE des bibliothèques qu'elles exigent (contrats 5.2). Plotly vient de là, pas du widget :
// c'est ici - et seulement ici - que les tests nomment son adresse et son empreinte, comme le catalogue de GFS (bibliotheques/catalogue.json).
//   window.__gfsStub.extensions : les extensions actives (par défaut ['graphique']) ; setExtensions(liste) les change et envoie l'événement `extensions`, comme GFS quand la personne en active une.
//   window.__gfsStub.mode : 'cdn' (l'adresse de jsDelivr) ou 'vendorise' (un fichier de l'origine de la page, /vendor/plotly/2.13.2/plotly-basic.min.js, que le test sert lui-même).
//   window.__gfsStub.editionLive : la bibliothèque « edition-live » de l'écriture en direct, { src, integrite, forme: 'module' } (consigne GFS 012 : un seul fichier assemblé, de forme module) - null : GFS ne la
//   donne pas. C'est le test qui la fixe (le fichier qu'il sert lui-même, dev-tests/live-test-kit.mjs) ; l'extension « edition » l'exige (`requires`).
//   window.__gfsStub.calls : les appels reçus ({ nom, args }) ; ignoreContext : ne pas répondre (GFS absent) ; installReply : { actives } ou { error } que reçoit `installer`.
//   window.__gfsStub.adresseWidget : l'adresse du widget que rend le contexte (contrats 5.2, consigne 009) : celle de GFS, que portent les sections de la page, jamais celle de la page de test (le widget n'en
//   est que le sous-cadre) ; null : GFS ne la donne pas. Réglée avant le chargement de la page, comme `mode` : le contexte ne se demande qu'au démarrage, et l'événement `extensions` n'en porte pas.
//   window.__gfsStub.ouverture : l'`ouverture` que rend le contexte (contrats 5.2, point 3, consigne 010) : null, ou { fichier: null | { id, type }, type, dossier, raison } ; réglée avant le chargement.
//   window.__gfsStub.langue : la langue de GFS que rend le contexte (`fr` ou `en`, contrats 5.2 point 6, consigne 019) - null : GFS ne la donne pas, comme un GFS d'avant la consigne 019 (par défaut). C'est le
//   test qui la fixe, et dev-tests/gfs-page.mjs la met dans l'adresse du cadre (`language=`) à sa création, comme GFS ; setLangue(l) la change et envoie l'événement `langue`, une seule fois, sans toucher au cadre
//   (GFS ne le recharge jamais : son adresse garde la langue de sa création, le contexte dit celle qui vaut maintenant).
//   window.__gfsStub.ouvrir(args) : l'appel `ouvrir` de GFS vers l'app déjà ouverte (contrats 5.4) ; la promesse rend la réponse ou l'erreur de l'app. call(nom, args) : un appel de GFS de ce nom.
//   window.__gfsStub.answers : tout ce que l'app répond aux appels de GFS ({ type, id, data | code, message }), dans l'ordre.
//   window.__gfsStubParent = 'nom' (posé avant ce script) : le stub est chargé par la page PARENTE d'un <iframe name="nom"> qui porte l'app dans un cadre isolé (dev-tests/verify-gfs-frame.mjs) et joue
//   GFS pour ce cadre, par `postMessage` dans les deux sens, comme le vrai GFS.
(function () {
  const CONTRACT = 0;
  const INTEGRITY = 'sha384-1heFF/cJ46y4QUvJzTPTs4/F4/UYCTLl6QErQgvqkxbzN+5yx5TQUVGf6ufPqcve';
  // `window.__gfsStubParent` (le nom d'un <iframe> de la page, posé AVANT ce script) : le stub vit alors dans la page PARENTE et joue GFS pour ce cadre, comme le vrai GFS (consigne 011 : l'app
  // dans un cadre isolé, sans `allow-same-origin`). Il écoute les messages de ce cadre seulement et lui répond par `postMessage` ; il ne remplace plus `window.postMessage`.
  const parentOf = window.__gfsStubParent || null;
  const appFrame = () => (parentOf ? document.querySelector('iframe[name="' + parentOf + '"]') : null);
  const deliver = parentOf
    ? (message) => { const frame = appFrame(); if (frame && frame.contentWindow) frame.contentWindow.postMessage(message, '*'); }
    : window.postMessage.bind(window);               // l'original : GFS vers l'app
  const waiting = new Map();                         // id d'un appel de GFS -> qui attend la réponse de l'app
  let nextCallId = 1;
  const stub = window.__gfsStub = {
    contract: CONTRACT,
    extensions: ['graphique'],
    requires: { graphique: ['plotly'], edition: ['edition-live'] },
    editionLive: null,
    mode: 'cdn',
    adresseWidget: 'https://gfs.example/gfs/index.html',
    ouverture: null,
    langue: null,
    ignoreContext: false,
    contextDelayMs: 0,
    installReply: null,
    calls: [],
    answers: [],
    library(id) {
      if (id === 'edition-live') return stub.editionLive;
      if (id !== 'plotly') return null;
      return stub.mode === 'vendorise'
        ? { src: window.location.origin + '/vendor/plotly/2.13.2/plotly-basic.min.js', integrite: INTEGRITY }
        : { src: 'https://cdn.jsdelivr.net/npm/plotly.js-basic-dist-min@2.13.2/plotly-basic.min.js', integrite: INTEGRITY };
    },
    libraries(extensions) {
      const given = {};
      extensions.forEach(extension => (stub.requires[extension] || []).forEach((id) => { const lib = stub.library(id); if (lib) given[id] = lib; }));
      return given;
    },
    context() {
      const data = { contrat: CONTRACT, hote: { nom: 'GFS simulé', version: '0' }, adresseWidget: stub.adresseWidget, extensions: stub.extensions.slice(), bibliotheques: stub.libraries(stub.extensions), ouverture: stub.ouverture };
      if (stub.langue) data.langue = stub.langue;
      return data;
    },
    post(message) { deliver(Object.assign({ gfs: CONTRACT }, message), '*'); },
    // Un appel de GFS vers l'app (contrats 5.1) : la promesse rend la réponse ou l'erreur de l'app.
    call(nom, args) {
      const id = nextCallId;
      nextCallId += 1;
      return new Promise((resolve) => { waiting.set(id, resolve); stub.post({ type: 'appel', id, nom, args }); });
    },
    ouvrir(args) { return stub.call('ouvrir', args); },
    // L'événement `extensions` : la liste active et la source de leurs bibliothèques.
    send() { stub.post({ type: 'evenement', nom: 'extensions', data: { extensions: stub.extensions.slice(), bibliotheques: stub.libraries(stub.extensions) } }); },
    setExtensions(list) { stub.extensions = list.slice(); stub.send(); },
    // L'événement `langue` : la personne change la langue de GFS (un seul choix pour GFS et toutes ses apps). Rien n'est envoyé quand elle ne change pas, comme GFS.
    setLangue(next) {
      if (next === stub.langue) return;
      stub.langue = next;
      stub.post({ type: 'evenement', nom: 'langue', data: { langue: next } });
    },
  };
  // Ce que l'app écrit à son parent : ses appels (contrats 5.1) et ses réponses aux appels de GFS.
  function fromApp(message) {
    if (message.type === 'reponse' || message.type === 'erreur') {
      stub.answers.push(message);
      const done = waiting.get(message.id);
      if (done) { waiting.delete(message.id); done(message); }
      return;
    }
    stub.calls.push({ nom: message.nom, args: message.args });
    if (message.nom === 'contexte') {
      if (stub.ignoreContext) return;
      setTimeout(() => stub.post({ type: 'reponse', id: message.id, data: stub.context() }), stub.contextDelayMs);
    } else if (message.nom === 'installer') {
      const reply = stub.installReply || { actives: stub.extensions.slice() };
      if (reply.error) stub.post({ type: 'erreur', id: message.id, code: 'GFS_REFUSE', message: reply.error });
      else stub.post({ type: 'reponse', id: message.id, data: reply });
    } else stub.post({ type: 'erreur', id: message.id, code: 'GFS_INCONNU', message: 'appel inconnu : ' + message.nom });
  }
  if (parentOf) {
    window.addEventListener('message', (event) => {
      const frame = appFrame();
      if (frame && event.source === frame.contentWindow && event.data && event.data.gfs === CONTRACT) fromApp(event.data);
    });
    return;
  }
  window.postMessage = function (message, targetOrigin, transfer) {
    const envelope = message && typeof message === 'object' && message.gfs === CONTRACT && (message.type === 'appel' || message.type === 'reponse' || message.type === 'erreur');
    if (!envelope) return deliver(message, targetOrigin, transfer);
    setTimeout(() => fromApp(message), 0);
    return undefined;
  };
})();
