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
//   window.__gfsStub.calls : les appels reçus ({ nom, args, id }) ; ignoreContext : ne pas répondre (GFS absent) ; installReply : { actives } ou { error } que reçoit `installer`.
//   window.__gfsStub.adresseWidget : l'adresse du widget que rend le contexte (contrats 5.2, consigne 009) : celle de GFS, que portent les sections de la page, jamais celle de la page de test (le widget n'en
//   est que le sous-cadre) ; null : GFS ne la donne pas. Réglée avant le chargement de la page, comme `mode` : le contexte ne se demande qu'au démarrage, et l'événement `extensions` n'en porte pas.
//   window.__gfsStub.ouverture : l'`ouverture` que rend le contexte (contrats 5.2, point 3, consigne 010) : null, ou { fichier: null | { id, type }, type, dossier, raison } ; réglée avant le chargement.
//   window.__gfsStub.langue : la langue de GFS que rend le contexte (`fr` ou `en`, contrats 5.2 point 6, consigne 019) - null : GFS ne la donne pas, comme un GFS d'avant la consigne 019 (par défaut). C'est le
//   test qui la fixe, et dev-tests/gfs-page.mjs la met dans l'adresse du cadre (`language=`) à sa création, comme GFS ; setLangue(l) la change et envoie l'événement `langue`, une seule fois, sans toucher au cadre
//   (GFS ne le recharge jamais : son adresse garde la langue de sa création, le contexte dit celle qui vaut maintenant).
//   window.__gfsStub.stockage : l'espace de l'app que rend le contexte (contrats 5.2, consigne 024) : un objet { clé: texte } - GFS le garde pour l'app, qui le relit à chaque `contexte` (un cadre rechargé retrouve ce
//   qu'il avait écrit, la page parente restant la même) - ou null : un GFS d'avant la consigne 024 (par défaut), dont le contexte n'a pas de `stockage` et qui ignore l'appel `stockage.ecrire` (il répond
//   `GFS_INCONNU` à un appel qui porte un `id`). L'appel `stockage.ecrire { cle, valeur }` (contrats 5.1) change l'objet (`valeur: null` retire la clé) ; sans `id` il ne répond rien, avec un `id` il rend
//   `{ retenu: true }` ; une clé ou une valeur hors de la règle de GFS (1 à 64 caractères parmi A-Z a-z 0-9 _ . : -, valeur en texte) reçoit `GFS_REFUSE` et rien n'est écrit (`refus` les garde). Les appels
//   reçus sont dans `calls` comme les autres (`{ nom, args, id }` : `id` absent d'un appel qui n'attend pas de réponse). C'est le test qui le fixe, avant le chargement.
//   window.__gfsStub.barre : la barre de GFS que rend le contexte (contrats 5.2 point 7, consigne 025) : `{ bord, epaisseur, zone: { x, y, largeur, hauteur } }` (le bord est `gauche`, `haut`, `droite` ou `bas`), null :
//   pas de barre (l'explorateur est ouvert), ou undefined : un GFS d'avant la consigne 025 (par défaut), dont le contexte n'a pas de `barre` et qui ignore l'appel `barre.masquer` (il répond `GFS_INCONNU` à un appel qui
//   porte un `id`). setBarre(barre) la change et envoie l'événement `barre`, une seule fois par changement (rien si l'état montré ne change pas). L'appel `barre.masquer { masquee }` (contrats 5.1) masque la
//   barre (`masquee: true` : l'événement `barre` suit, avec null) ou la rend ; sans `id` il ne répond rien, avec un `id` il rend `{ masquee }` ; un argument qui n'est pas vrai ou faux reçoit `GFS_REFUSE` (`refusBarre`
//   les garde). GFS remontre la barre à chaque `contexte` : un cadre rechargé repart avec elle. `masquee` dit si l'app l'a masquée. window.__gfsStub.zoneDe(bord, largeur, hauteur) donne la forme que GFS calcule
//   pour un cadre de cette taille (34 × 124 px à 4 px du bord, centrée sur lui, 4 px de marge autour : la zone fait 42 × 132 px), celle que donne la consigne 026 pour la barre à quatre boutons (700 × 400, gauche : x 0, y 134).
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
    stockage: null,
    refus: [],
    barre: undefined,
    masquee: false,
    refusBarre: [],
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
      if (stub.stockage) data.stockage = Object.assign({}, stub.stockage);
      if (stub.barre !== undefined) data.barre = stub.shownBar();
      return data;
    },
    // La barre que GFS montre à l'app : null quand il n'y en a pas (explorateur ouvert) ou que l'app l'a masquée.
    shownBar() {
      return stub.barre && !stub.masquee ? JSON.parse(JSON.stringify(stub.barre)) : null;
    },
    // La forme que GFS calcule pour un cadre de `width` × `height` : la barre fait 34 × 124 px (124 × 34 en haut et en bas), à 4 px du bord et centrée sur lui ; la zone y ajoute 4 px tout autour.
    zoneDe(bord, width, height) {
      const side = 34 + 2 * 4;
      const length = 124 + 2 * 4;
      const vertical = bord === 'gauche' || bord === 'droite';
      const w = vertical ? side : length;
      const h = vertical ? length : side;
      const x = bord === 'gauche' ? 0 : bord === 'droite' ? width - side : Math.round((width - length) / 2);
      const y = bord === 'haut' ? 0 : bord === 'bas' ? height - side : Math.round((height - length) / 2);
      return { bord, epaisseur: side, zone: { x, y, largeur: w, hauteur: h } };
    },
    sendBarre() { stub.post({ type: 'evenement', nom: 'barre', data: { barre: stub.shownBar() } }); },
    // La barre change (la personne la déplace, le cadre change de taille, l'explorateur s'ouvre ou se ferme) : l'événement `barre` part une seule fois, et seulement si ce que l'app voit change.
    setBarre(next) {
      const before = JSON.stringify(stub.shownBar());
      stub.barre = next;
      if (JSON.stringify(stub.shownBar()) !== before) stub.sendBarre();
    },
    // L'appel `barre.masquer` (consigne 025) : voir `barre` ci-dessus.
    hideBar(message) {
      const answers = Number.isInteger(message.id);
      if (stub.barre === undefined) {
        if (answers) stub.post({ type: 'erreur', id: message.id, code: 'GFS_INCONNU', message: 'appel inconnu : barre.masquer' });
        return;
      }
      const args = message.args && typeof message.args === 'object' ? message.args : {};
      if (typeof args.masquee !== 'boolean') {
        stub.refusBarre.push(args);
        if (answers) stub.post({ type: 'erreur', id: message.id, code: 'GFS_REFUSE', message: 'masquee doit être vrai ou faux' });
        return;
      }
      const before = JSON.stringify(stub.shownBar());
      stub.masquee = args.masquee;
      if (JSON.stringify(stub.shownBar()) !== before) stub.sendBarre();
      if (answers) stub.post({ type: 'reponse', id: message.id, data: { masquee: stub.masquee } });
    },
    // L'appel `stockage.ecrire` (consigne 024) : voir `stockage` ci-dessus.
    writeStorage(message) {
      const answers = Number.isInteger(message.id);
      if (!stub.stockage) {
        if (answers) stub.post({ type: 'erreur', id: message.id, code: 'GFS_INCONNU', message: 'appel inconnu : stockage.ecrire' });
        return;
      }
      const args = message.args && typeof message.args === 'object' ? message.args : {};
      const valid = typeof args.cle === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(args.cle) && (args.valeur === null || typeof args.valeur === 'string');
      if (!valid) {
        stub.refus.push(args);
        if (answers) stub.post({ type: 'erreur', id: message.id, code: 'GFS_REFUSE', message: 'clé ou valeur hors de la règle' });
        return;
      }
      if (args.valeur === null) delete stub.stockage[args.cle]; else stub.stockage[args.cle] = args.valeur;
      if (answers) stub.post({ type: 'reponse', id: message.id, data: { retenu: true } });
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
    stub.calls.push({ nom: message.nom, args: message.args, id: message.id });
    if (message.nom === 'contexte') {
      if (stub.ignoreContext) return;
      setTimeout(() => { stub.masquee = false; stub.post({ type: 'reponse', id: message.id, data: stub.context() }); }, stub.contextDelayMs);
    } else if (message.nom === 'stockage.ecrire') {
      stub.writeStorage(message);
    } else if (message.nom === 'barre.masquer') {
      stub.hideBar(message);
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
