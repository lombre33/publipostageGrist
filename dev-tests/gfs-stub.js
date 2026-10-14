// Un Grist Factory Suite (GFS) simulé pour les tests : la page de test s'ouvre avec `?gfs=0` dans son adresse (« hébergée », contrats de GFS 1.3 point 3) et ce script répond à la place de GFS.
// Posé AVANT les scripts de la page (page.addInitScript) : js/gfs-link.js demande le contexte dès son chargement. Comme la page de test est une fenêtre de premier niveau
// (`window.parent === window`), les messages que le widget croit envoyer à GFS lui reviennent : le stub les lit et répond dans la même fenêtre (`event.source === window.parent` y est vrai).
// Il joue le rôle de GFS que le widget ne peut pas jouer lui-même : la liste des extensions actives et la SOURCE des bibliothèques qu'elles exigent (contrats 5.2). Plotly vient de là, pas du widget :
// c'est ici - et seulement ici - que les tests nomment son adresse et son empreinte, comme le catalogue de GFS (bibliotheques/catalogue.json).
//   window.__gfsStub.extensions : les extensions actives (par défaut ['graphique']) ; setExtensions(liste) les change et envoie l'événement `extensions`, comme GFS quand la personne en active une.
//   window.__gfsStub.mode : 'cdn' (l'adresse de jsDelivr) ou 'vendorise' (un fichier de l'origine de la page, /vendor/plotly/2.13.2/plotly-basic.min.js, que le test sert lui-même).
//   window.__gfsStub.calls : les appels reçus ({ nom, args }) ; ignoreContext : ne pas répondre (GFS absent) ; installReply : { actives } ou { error } que reçoit `installer`.
(function () {
  const CONTRACT = 0;
  const INTEGRITY = 'sha384-1heFF/cJ46y4QUvJzTPTs4/F4/UYCTLl6QErQgvqkxbzN+5yx5TQUVGf6ufPqcve';
  const stub = window.__gfsStub = {
    contract: CONTRACT,
    extensions: ['graphique'],
    requires: { graphique: ['plotly'] },
    mode: 'cdn',
    ignoreContext: false,
    contextDelayMs: 0,
    installReply: null,
    calls: [],
    library(id) {
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
      return { contrat: CONTRACT, hote: { nom: 'GFS simulé', version: '0' }, extensions: stub.extensions.slice(), bibliotheques: stub.libraries(stub.extensions), ouverture: null };
    },
    post(message) { window.postMessage(Object.assign({ gfs: CONTRACT }, message), '*'); },
    // L'événement `extensions` : la liste active et la source de leurs bibliothèques.
    send() { stub.post({ type: 'evenement', nom: 'extensions', data: { extensions: stub.extensions.slice(), bibliotheques: stub.libraries(stub.extensions) } }); },
    setExtensions(list) { stub.extensions = list.slice(); stub.send(); },
  };
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (event.source !== window || !message || typeof message !== 'object' || message.gfs !== CONTRACT || message.type !== 'appel') return;
    stub.calls.push({ nom: message.nom, args: message.args });
    if (message.nom === 'contexte') {
      if (stub.ignoreContext) return;
      setTimeout(() => stub.post({ type: 'reponse', id: message.id, data: stub.context() }), stub.contextDelayMs);
    } else if (message.nom === 'installer') {
      const reply = stub.installReply || { actives: stub.extensions.slice() };
      if (reply.error) stub.post({ type: 'erreur', id: message.id, code: 'GFS_REFUSE', message: reply.error });
      else stub.post({ type: 'reponse', id: message.id, data: reply });
    } else stub.post({ type: 'erreur', id: message.id, code: 'GFS_INCONNU', message: 'appel inconnu : ' + message.nom });
  });
})();
