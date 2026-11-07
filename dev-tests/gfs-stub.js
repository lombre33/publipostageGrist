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
//   window.__gfsStub.pdfjs : la bibliothèque « pdfjs » de la lecture de PDF, { src, integrite, forme: 'module' } (consigne GFS 040 : pdf.js 6.5 et son moteur en UN fichier de forme module, qui se range dans
//   GfsPaquets.pdfjs) - null : GFS ne la donne pas. C'est le test qui la fixe (le fichier qu'il sert lui-même, dev-tests/verify-gfs-read.mjs) ; l'extension « lecture-pdf » l'exige (`requires`).
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
//   window.__gfsStub.setReglages(enregistres) : l'événement `reglages` (contrats 5.2 point 2, consigne 039), que GFS envoie après chaque écriture des réglages de la vue de l'app : `enregistres: true`, le réglage est dans
//   la vue ; `false`, il est resté un brouillon de Grist. Le contexte n'en porte pas : avant le premier appel, l'app ne sait rien.
//   window.__gfsStub.ambiance : le message d'ambiance que rend le contexte (contrats 5.2 point 10, consigne 041) : `{ id, couleur, ajustee, clair, sombre, forme }` (dix-neuf jetons de couleur par mode, la forme en textes de CSS), null : rien n'est choisi
//   (Grist Factory sans couleur), ou undefined : un GFS d'avant la consigne 041 (par défaut), dont le contexte n'a pas d'`ambiance` et qui n'envoie aucun événement. Réglée avant le chargement de la page, comme `barre` ; setAmbiance(message)
//   la change et envoie l'événement `ambiance` `{ ambiance }`, UNE seule fois par geste, et rien quand le message ne change pas, comme GFS. dev-tests/fixtures/ambiances-gfs.json porte de vrais messages, produits par le moteur d'ambiances de GFS.
//   window.__gfsStub.ranger : l'appel `ranger { fichier, nom, type?, lot?, suivants?, dossier? }` (contrats 5.4 point 9, consigne 043) - null : un GFS d'avant la consigne 043, dont l'appel reçoit `GFS_INCONNU` (par défaut) ; sinon un objet de réglage que le
//   test pose (`{}` : un GFS qui sait ranger) : `quandPris` ('copie' par défaut, 'remplace' ou 'ignore', ou une fonction `(nom, args, rang) => …` : ce que la personne répond à la fenêtre « Ce nom est déjà pris »), `erreur` ({ code, message } : toutes les
//   demandes échouent ainsi), `erreurs` ({ rang: { code, message } } : celle-là seule, `rang` compté de 1 dans l'ordre des appels), `delai` (millisecondes avant la réponse : le temps que la personne prend). Il tient le contrat : le nom reçoit « .pdf » s'il lui
//   manque et son retour à la ligne devient une espace (1 à 200 signes), `lot` 1 à 64 signes, `suivants` un entier de 0 ou plus, `type` seulement `pdf`, le contenu non vide et qui commence par %PDF-, sinon `GFS_REFUSE` ; un nom déjà pris (sans tenir compte de
//   la casse) pose la question : `copie` garde les deux (« Facture (1).pdf »), `remplace` garde l'identifiant et prend le contenu, `ignore` n'écrit rien (`id` et `nom` null). Les fichiers gardés sont dans `fichiers` ({ id, nom, taille, octets, lot }), `rangerAppels`
//   dit chaque appel reçu dans l'ordre ({ rang, nom, lot, suivants, taille, type, instance, dossier }), `rangerEnCours` compte les appels sans réponse et `rangerMax` le plus grand nombre à la fois (1 : un fichier à la fois).
//   window.__gfsStub.ouvrir(args) : l'appel `ouvrir` de GFS vers l'app déjà ouverte (contrats 5.4) ; la promesse rend la réponse ou l'erreur de l'app. call(nom, args) : un appel de GFS de ce nom.
//   window.__gfsStub.fermer(raison) : l'appel `fermer { raison }` de GFS vers l'app active (contrats 5.4, point 3, consigne 047), envoyé avant qu'une autre app prenne sa place : la promesse rend la réponse (`{ ferme }`) ou l'erreur de l'app,
//   et le stub ne détruit rien (la page reste là, comme un GFS dont la personne a répondu « Annuler »). Une app qui ne connaît pas l'appel rend l'erreur `GFS_INCONNU`.
//   window.__gfsStub.answers : tout ce que l'app répond aux appels de GFS ({ type, id, data | code, message }), dans l'ordre.
//   window.__gfsStub.joindre : l'appel `joindre { table, colonne, mode?, fichiers: [{ ligne, fichier, nom }] }` (contrats 5.4 point 12, consigne 053 : GFS joint lui-même le PDF à la cellule « Pièces jointes » de sa ligne, l'app ne reçoit aucun jeton
//   d'écriture) - null : un GFS d'avant ce geste, dont l'appel reçoit `GFS_INCONNU` (par défaut) ; sinon un objet de réglage qui rejoue GFS (attach.js de GFS) : `delai` (ms), `erreur` / `erreurs[rang]` ({ code, message } : l'appel est refusé), `lignes` (les
//   lignes qui existent : une autre est un échec `ligne` ; toutes par défaut), `etatColonne` (`absente` ou `inutilisable` : rien n'est envoyé, chaque fichier est un échec de ce mot) et `arret(rang, args)` (rend `{ mot, aPartirDe? }` : à partir de l'entrée `aPartirDe`
//   (0 par défaut) Grist refuse avec ce mot du contrat - `refus`, `injoignable`, `echec` -, les suivantes sont des échecs du même mot, jamais essayées) ; `tropGros(rang, args)` rend la liste des entrées trop grosses pour Grist (413) : chacune est un échec `trop-gros` à elle seule (`probleme` reste null, les autres sont jointes : réponse de GFS, consigne 054). La forme est vérifiée comme GFS le fait (`GFS_REFUSE` : table, colonne, mode, 1 à 200 entrées, ligne
//   entière d'au moins 1, `fichier` un Blob non vide qui porte `%PDF-` dans ses 1 024 premiers octets, nom de 1 à 200 signes) ; `mode: 'remplacer'` (par défaut) retire la pièce de même nom (blancs rognés, casse ignorée) de la même ligne et de la même colonne.
//   `reponse` (une valeur, ou une fonction `(rang, args) => valeur`) remplace le rapport tel quel après la vérification de la forme : de quoi essayer une réponse mal formée ou un GFS plus récent.
//   `joindreAppels` dit chaque appel reçu ({ rang, table, colonne, mode, cles, entrees: [{ ligne, nom, taille, type, instance, cles }] }), `joindreEnCours` et `joindreMax` (1 : un appel à la fois) et `pieces` ce que GFS a joint ({ table, colonne, ligne, nom, taille,
//   octets, rang }).
//   window.__gfsStub.lecteurs : les sites dont GFS sait jouer le lecteur que rend le contexte (demande du 06/11, objet vidéo de Slides+, js/video-frame.js) : `['youtube', 'vimeo']`, ou undefined : un GFS d'avant la demande
//   (par défaut), dont le contexte n'a pas de `lecteurs` et qui répond `GFS_INCONNU` aux appels `lecteur.*`. setLecteurs(liste) la change et envoie l'événement `lecteurs`. Les appels `lecteur.afficher { id, fournisseur, video, debut?, rect,
//   zone }`, `lecteur.deplacer { id, rect, zone }`, `lecteur.masquer { id, masque }` et `lecteur.fermer { id }` tiennent le contrat (un `id` de la forme `^[a-z][a-z0-9_-]{0,63}$`, un `video` qui passe le motif du site, des nombres
//   finis, un seul lecteur à la fois) ou sont ignorés et rangés dans `lecteurRefus` ; les autres sont dans `lecteurAppels` ({ nom, args }, dans l'ordre). `lecteur` est le lecteur en cours ({ id, fournisseur, video, debut, rect, zone, masque,
//   adresse }, `adresse` : celle que GFS monterait d'après ses gabarits, jamais chargée) ou null ; dans une page PARENTE (`__gfsStubParent`) un cadre de couleur franche (#ff00ff, `#gfs-lecteur`) est posé par-dessus le cadre de l'app,
//   rogné à `zone` et à ce cadre, caché par `masque` : de quoi mesurer où le lecteur tombe. setEtatLecteur(etat) envoie l'événement `lecteur { id, etat }` du lecteur en cours.
//   window.__gfsStubParent = 'nom' (posé avant ce script) : le stub est chargé par la page PARENTE d'un <iframe name="nom"> qui porte l'app dans un cadre isolé (dev-tests/verify-gfs-frame.mjs) et joue
//   GFS pour ce cadre, par `postMessage` dans les deux sens, comme le vrai GFS.
(function () {
  const CONTRACT = 0;
  const INTEGRITY = 'sha384-1heFF/cJ46y4QUvJzTPTs4/F4/UYCTLl6QErQgvqkxbzN+5yx5TQUVGf6ufPqcve';
  // ECharts 6.1.0 (le graphique créé, extensions/graphique/chart-make.js) : le paquet complet de jsDelivr et son empreinte, comme le catalogue de GFS les donne en mode CDN.
  const ECHARTS_INTEGRITY = 'sha384-C2iskrW/uPW46KzOjrvJIQo4YkV8lkD+QS0CrDN18IIPIpT/g2USu8bTP3nvmIAD';
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
    echarts: true,   // false : GFS ne porte pas ECharts (un GFS d'avant le graphique créé) : `library('echarts')` rend null
    requires: { graphique: ['plotly', 'echarts'], edition: ['edition-live'], 'lecture-pdf': ['pdfjs'] },
    editionLive: null,
    pdfjs: null,
    mode: 'cdn',
    adresseWidget: 'https://gfs.example/gfs/index.html',
    ouverture: null,
    langue: null,
    stockage: null,
    refus: [],
    barre: undefined,
    ambiance: undefined,
    masquee: false,
    refusBarre: [],
    ignoreContext: false,
    contextDelayMs: 0,
    lecteurs: undefined,
    lecteur: null,
    lecteurAppels: [],
    lecteurRefus: [],
    installReply: null,
    ranger: null,
    joindre: null,
    joindreAppels: [],
    joindreEnCours: 0,
    joindreMax: 0,
    pieces: [],
    fichiers: [],
    rangerAppels: [],
    rangerEnCours: 0,
    rangerMax: 0,
    prochainFichier: 1,
    calls: [],
    answers: [],
    library(id) {
      if (id === 'edition-live') return stub.editionLive;
      if (id === 'pdfjs') return stub.pdfjs;
      if (id === 'echarts') return stub.echarts === false ? null : { src: 'https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js', integrite: ECHARTS_INTEGRITY };
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
      if (stub.ambiance !== undefined) data.ambiance = JSON.parse(JSON.stringify(stub.ambiance));
      if (stub.lecteurs !== undefined) data.lecteurs = stub.lecteurs.slice();
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
    // L'appel `ranger` (consigne 043) : voir `ranger` ci-dessus.
    async deposit(message) {
      const answers = Number.isInteger(message.id);
      const fail = (code, text) => { if (answers) stub.post({ type: 'erreur', id: message.id, code, message: text }); };
      const options = stub.ranger;
      if (!options) { fail('GFS_INCONNU', 'appel inconnu : ranger'); return; }
      const args = message.args && typeof message.args === 'object' ? message.args : {};
      stub.rangerEnCours += 1;
      stub.rangerMax = Math.max(stub.rangerMax, stub.rangerEnCours);
      try {
        const rank = stub.rangerAppels.length + 1;
        const file = args.fichier;
        const isBlob = typeof Blob === 'function' && file instanceof Blob;
        const bytes = isBlob ? new Uint8Array(await file.arrayBuffer()) : null;
        stub.rangerAppels.push({
          rang: rank, nom: args.nom, lot: args.lot, suivants: args.suivants, dossier: args.dossier, typeDeclare: args.type,
          taille: bytes ? bytes.length : 0, type: isBlob ? file.type : '', instance: isBlob ? (typeof File === 'function' && file instanceof File ? 'File' : 'Blob') : typeof file,
        });
        if (options.delai) await new Promise(resolve => setTimeout(resolve, options.delai));
        const failure = (options.erreurs && options.erreurs[rank]) || options.erreur;
        if (failure) { fail(failure.code, failure.message || failure.code); return; }
        const name = typeof args.nom === 'string' ? args.nom.replace(/[\r\n]+/g, ' ').trim() : '';
        const named = /\.pdf$/i.test(name) ? name : name + '.pdf';
        const refusal = !bytes ? 'fichier manquant'
          : (!name || named.length > 200) ? 'nom hors de la règle (1 à 200 signes)'
            : (args.lot !== undefined && !(typeof args.lot === 'string' && args.lot.length >= 1 && args.lot.length <= 64)) ? 'lot hors de la règle (1 à 64 signes)'
              : (args.suivants !== undefined && !(Number.isInteger(args.suivants) && args.suivants >= 0)) ? 'suivants hors de la règle (un entier de 0 ou plus)'
                : (args.type !== undefined && args.type !== 'pdf') ? 'type non déclaré : ' + args.type
                  : (!bytes.length || String.fromCharCode.apply(null, Array.from(bytes.slice(0, 5))) !== '%PDF-') ? 'ce fichier n’est pas un PDF' : '';
        if (refusal) { fail('GFS_REFUSE', refusal); return; }
        const taken = stub.fichiers.find(f => f.nom.toLowerCase() === named.toLowerCase());
        const reply = data => { if (answers) stub.post({ type: 'reponse', id: message.id, data }); };
        const keep = (finalName, id) => { const entry = { id: id == null ? stub.prochainFichier++ : id, nom: finalName, taille: bytes.length, octets: bytes, lot: args.lot }; stub.fichiers.push(entry); return entry; };
        if (!taken) { const entry = keep(named); reply({ statut: 'ajoute', id: entry.id, nom: entry.nom }); return; }
        const answer = typeof options.quandPris === 'function' ? options.quandPris(named, args, rank) : (options.quandPris || 'copie');
        if (answer === 'remplace') { taken.taille = bytes.length; taken.octets = bytes; taken.lot = args.lot; reply({ statut: 'remplace', id: taken.id, nom: taken.nom }); return; }
        if (answer === 'ignore') { reply({ statut: 'ignore', id: null, nom: null }); return; }
        const base = named.replace(/\.pdf$/i, '');
        let n = 1;
        while (stub.fichiers.some(f => f.nom.toLowerCase() === (base + ' (' + n + ').pdf').toLowerCase())) n += 1;
        const entry = keep(base + ' (' + n + ').pdf');
        reply({ statut: 'copie', id: entry.id, nom: entry.nom });
      } finally {
        stub.rangerEnCours -= 1;
      }
    },
    // L'appel `joindre` (consigne 053) : voir `joindre` ci-dessus.
    async attach(message) {
      const answers = Number.isInteger(message.id);
      const fail = (code, text) => { if (answers) stub.post({ type: 'erreur', id: message.id, code, message: text }); };
      const options = stub.joindre;
      if (!options) { fail('GFS_INCONNU', 'appel inconnu : joindre'); return; }
      const args = message.args && typeof message.args === 'object' ? message.args : {};
      stub.joindreEnCours += 1;
      stub.joindreMax = Math.max(stub.joindreMax, stub.joindreEnCours);
      try {
        const rank = stub.joindreAppels.length + 1;
        const entries = Array.isArray(args.fichiers) ? args.fichiers : [];
        const heads = await Promise.all(entries.map(async (entry) => {
          const file = entry && entry.fichier;
          const isBlob = typeof Blob === 'function' && file instanceof Blob;
          return isBlob ? new Uint8Array(await file.arrayBuffer()) : null;
        }));
        stub.joindreAppels.push({
          rang: rank, table: args.table, colonne: args.colonne, mode: args.mode, cles: Object.keys(args),
          entrees: entries.map((entry, i) => {
            const file = entry && entry.fichier;
            const isBlob = typeof Blob === 'function' && file instanceof Blob;
            return {
              ligne: entry && entry.ligne, nom: entry && entry.nom, taille: heads[i] ? heads[i].length : 0, type: isBlob ? file.type : '',
              instance: isBlob ? (typeof File === 'function' && file instanceof File ? 'File' : 'Blob') : typeof file, cles: entry && typeof entry === 'object' ? Object.keys(entry) : [],
            };
          }),
        });
        if (options.delai) await new Promise(resolve => setTimeout(resolve, options.delai));
        const failure = (options.erreurs && options.erreurs[rank]) || options.erreur;
        if (failure) { fail(failure.code, failure.message || failure.code); return; }
        const mode = args.mode === undefined ? 'remplacer' : args.mode;
        const clean = value => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() : '');
        const pdfStart = bytes => { const head = Array.from(bytes.slice(0, 1024)); for (let i = 0; i + 5 <= head.length; i += 1) if (head.slice(i, i + 5).join() === [37, 80, 68, 70, 45].join()) return true; return false; };
        let refusal = '';
        if (typeof args.table !== 'string' || !args.table) refusal = 'joindre : table doit être l’identifiant d’une table.';
        else if (typeof args.colonne !== 'string' || !args.colonne) refusal = 'joindre : colonne doit être l’identifiant d’une colonne.';
        else if (mode !== 'remplacer' && mode !== 'ajouter') refusal = 'joindre : mode doit valoir « remplacer » ou « ajouter ».';
        else if (!entries.length || entries.length > 200) refusal = 'joindre : fichiers doit être une liste de 1 à 200 entrées.';
        else {
          entries.some((entry, i) => {
            const given = entry && typeof entry === 'object' ? entry : {};
            const name = clean(given.nom);
            const named = /\.pdf$/i.test(name) ? name : name + '.pdf';
            if (!Number.isInteger(given.ligne) || given.ligne < 1) refusal = 'joindre : fichiers[' + i + '].ligne doit être un numéro de ligne (un entier d’au moins 1).';
            else if (!heads[i]) refusal = 'joindre : fichiers[' + i + '].fichier doit être un File ou un Blob.';
            else if (!heads[i].length) refusal = 'joindre : fichiers[' + i + '].fichier est vide.';
            else if (!name || named.length > 200) refusal = 'joindre : fichiers[' + i + '].nom doit être un texte de 1 à 200 signes.';
            else if (!pdfStart(heads[i])) refusal = 'joindre : fichiers[' + i + '].fichier n’est pas un PDF.';
            return !!refusal;
          });
        }
        if (refusal) { fail('GFS_REFUSE', refusal); return; }
        if (options.reponse !== undefined) { if (answers) stub.post({ type: 'reponse', id: message.id, data: typeof options.reponse === 'function' ? options.reponse(rank, args) : options.reponse }); return; }
        const report = { colonne: args.colonne, probleme: null, joints: [], echecs: [] };
        if (options.etatColonne) {
          report.probleme = options.etatColonne;
          report.echecs = entries.map((entry, index) => ({ index, raison: options.etatColonne }));
        } else {
          const known = Array.isArray(options.lignes) ? new Set(options.lignes) : null;
          const stop = typeof options.arret === 'function' ? options.arret(rank, args) : null;
          const tooLarge = typeof options.tropGros === 'function' ? options.tropGros(rank, args) : [];
          let word = null;
          entries.forEach((entry, index) => {
            if (known && !known.has(entry.ligne)) { report.echecs.push({ index, raison: 'ligne' }); return; }
            if (!word && stop && index >= (stop.aPartirDe || 0)) { word = stop.mot; report.probleme = word; }
            if (word) { report.echecs.push({ index, raison: word }); return; }
            if (tooLarge.includes(index)) { report.echecs.push({ index, raison: 'trop-gros' }); return; }
            const name = clean(entry.nom);
            const named = /\.pdf$/i.test(name) ? name : name + '.pdf';
            const same = piece => piece.table === args.table && piece.colonne === args.colonne && piece.ligne === entry.ligne && piece.nom.trim().toLowerCase() === named.toLowerCase();
            const replaced = mode === 'remplacer' && stub.pieces.some(same);
            if (replaced) stub.pieces = stub.pieces.filter(piece => !same(piece));
            stub.pieces.push({ table: args.table, colonne: args.colonne, ligne: entry.ligne, nom: named, taille: heads[index].length, octets: heads[index], rang: rank });
            report.joints.push({ index, remplace: replaced });
          });
        }
        if (answers) stub.post({ type: 'reponse', id: message.id, data: report });
      } finally {
        stub.joindreEnCours -= 1;
      }
    },
    // Les appels `lecteur.*` (voir `lecteurs` ci-dessus).
    setLecteurs(next) {
      stub.lecteurs = next === undefined ? undefined : next.slice();
      stub.post({ type: 'evenement', nom: 'lecteurs', data: { lecteurs: next === undefined ? [] : next.slice() } });
    },
    setEtatLecteur(etat) { if (stub.lecteur) stub.post({ type: 'evenement', nom: 'lecteur', data: { id: stub.lecteur.id, etat } }); },
    playerAddress(provider, video, start) {
      if (provider === 'youtube') return 'https://www.youtube-nocookie.com/embed/' + video + '?autoplay=1&rel=0' + (start ? '&start=' + start : '');
      const parts = video.split('/');
      return 'https://player.vimeo.com/video/' + parts[0] + '?autoplay=1' + (parts[1] ? '&h=' + parts[1] : '') + (start ? '#t=' + start + 's' : '');
    },
    // Le rectangle { x, y, largeur, hauteur } d'un appel : quatre nombres finis, largeur et hauteur positives, à plus d'un cadre de l'app des bords au plus.
    validBox(box) {
      return !!box && typeof box === 'object' && ['x', 'y', 'largeur', 'hauteur'].every(key => typeof box[key] === 'number' && Number.isFinite(box[key])) && box.largeur > 0 && box.hauteur > 0 && Math.abs(box.x) < 20000 && Math.abs(box.y) < 20000;
    },
    // Pose, déplace, cache ou retire le cadre de couleur franche par-dessus le cadre de l'app (page parente seulement).
    layoutPlayer() {
      const frame = appFrame();
      let overlay = document.getElementById('gfs-lecteur');
      const p = stub.lecteur;
      if (!frame || !p) { if (overlay) overlay.remove(); return; }
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'gfs-lecteur';
        overlay.style.cssText = 'position:fixed;overflow:hidden;z-index:99999;';
        const inner = document.createElement('iframe');
        inner.style.cssText = 'position:absolute;border:0;';
        inner.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
        inner.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        inner.srcdoc = '<!doctype html><body style="margin:0;background:#ff00ff">';
        overlay.appendChild(inner);
        document.body.appendChild(overlay);
      }
      const inner = overlay.firstChild;
      inner.setAttribute('data-adresse', p.adresse);
      const box = frame.getBoundingClientRect();
      const left = Math.max(p.rect.x, p.zone.x, 0);
      const top = Math.max(p.rect.y, p.zone.y, 0);
      const right = Math.min(p.rect.x + p.rect.largeur, p.zone.x + p.zone.largeur, box.width);
      const bottom = Math.min(p.rect.y + p.rect.hauteur, p.zone.y + p.zone.hauteur, box.height);
      overlay.style.left = (box.left + left) + 'px';
      overlay.style.top = (box.top + top) + 'px';
      overlay.style.width = Math.max(0, right - left) + 'px';
      overlay.style.height = Math.max(0, bottom - top) + 'px';
      overlay.style.visibility = p.masque || right <= left || bottom <= top ? 'hidden' : 'visible';
      inner.style.left = (p.rect.x - left) + 'px';
      inner.style.top = (p.rect.y - top) + 'px';
      inner.style.width = p.rect.largeur + 'px';
      inner.style.height = p.rect.hauteur + 'px';
    },
    player(message) {
      const answers = Number.isInteger(message.id);
      const action = String(message.nom).slice('lecteur.'.length);
      if (stub.lecteurs === undefined) {
        if (answers) stub.post({ type: 'erreur', id: message.id, code: 'GFS_INCONNU', message: 'appel inconnu : ' + message.nom });
        return;
      }
      const args = message.args && typeof message.args === 'object' ? message.args : {};
      stub.lecteurAppels.push({ nom: action, args: JSON.parse(JSON.stringify(args)) });
      const idOk = typeof args.id === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(args.id);
      const refuse = (why) => { stub.lecteurRefus.push({ nom: action, args, why }); };
      if (!idOk) { refuse('id'); return; }
      if (action === 'afficher') {
        const rules = { youtube: /^[A-Za-z0-9_-]{11}$/, vimeo: /^\d{1,12}(?:\/[0-9a-f]{6,20})?$/ };
        if (stub.lecteurs.indexOf(args.fournisseur) === -1 || !rules[args.fournisseur] || typeof args.video !== 'string' || !rules[args.fournisseur].test(args.video)) { refuse('fournisseur ou video'); return; }
        if (args.debut !== undefined && !(Number.isInteger(args.debut) && args.debut >= 0)) { refuse('debut'); return; }
        if (!stub.validBox(args.rect) || !stub.validBox(args.zone)) { refuse('rect ou zone'); return; }
        stub.lecteur = { id: args.id, fournisseur: args.fournisseur, video: args.video, debut: args.debut || 0, rect: args.rect, zone: args.zone, masque: false, adresse: stub.playerAddress(args.fournisseur, args.video, args.debut || 0) };
      } else if (action === 'deplacer') {
        if (!stub.lecteur || stub.lecteur.id !== args.id) { refuse('id inconnu'); return; }
        if (!stub.validBox(args.rect) || !stub.validBox(args.zone)) { refuse('rect ou zone'); return; }
        stub.lecteur.rect = args.rect;
        stub.lecteur.zone = args.zone;
      } else if (action === 'masquer') {
        if (!stub.lecteur || stub.lecteur.id !== args.id || typeof args.masque !== 'boolean') { refuse('id inconnu ou masque'); return; }
        stub.lecteur.masque = args.masque;
      } else if (action === 'fermer') {
        if (stub.lecteur && stub.lecteur.id === args.id) stub.lecteur = null;
      } else { refuse('action'); return; }
      if (parentOf) stub.layoutPlayer();
    },
    post(message) { deliver(Object.assign({ gfs: CONTRACT }, message), '*'); },
    // Un appel de GFS vers l'app (contrats 5.1) : la promesse rend la réponse ou l'erreur de l'app.
    call(nom, args) {
      const id = nextCallId;
      nextCallId += 1;
      return new Promise((resolve) => { waiting.set(id, resolve); stub.post({ type: 'appel', id, nom, args }); });
    },
    ouvrir(args) { return stub.call('ouvrir', args); },
    fermer(raison) { return stub.call('fermer', { raison }); },
    // L'événement `extensions` : la liste active et la source de leurs bibliothèques.
    send() { stub.post({ type: 'evenement', nom: 'extensions', data: { extensions: stub.extensions.slice(), bibliotheques: stub.libraries(stub.extensions) } }); },
    setExtensions(list) { stub.extensions = list.slice(); stub.send(); },
    // L'événement `langue` : la personne change la langue de GFS (un seul choix pour GFS et toutes ses apps). Rien n'est envoyé quand elle ne change pas, comme GFS.
    setLangue(next) {
      if (next === stub.langue) return;
      stub.langue = next;
      stub.post({ type: 'evenement', nom: 'langue', data: { langue: next } });
    },
    // L'événement `reglages` : GFS dit où en sont les réglages de la vue que l'app vient d'écrire (voir l'en-tête). Envoyé tel quel, même quand l'état ne change pas : c'est l'app qui compare.
    setReglages(enregistres) { stub.post({ type: 'evenement', nom: 'reglages', data: { enregistres } }); },
    // L'événement `ambiance` : la personne change l'ambiance ou la couleur de GFS (un seul choix pour GFS et toutes ses apps). Un seul événement par geste, et aucun quand le message ne change pas, comme GFS.
    setAmbiance(next) {
      if (JSON.stringify(next) === JSON.stringify(stub.ambiance)) return;
      stub.ambiance = next === undefined ? undefined : JSON.parse(JSON.stringify(next));
      stub.post({ type: 'evenement', nom: 'ambiance', data: { ambiance: next === undefined ? null : JSON.parse(JSON.stringify(next)) } });
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
    } else if (/^lecteur\.(afficher|deplacer|masquer|fermer)$/.test(message.nom)) {
      stub.player(message);
    } else if (message.nom === 'ranger') {
      stub.deposit(message).catch((e) => { console.error('[gfs-stub] ranger en échec', e); if (Number.isInteger(message.id)) stub.post({ type: 'erreur', id: message.id, code: 'GFS_ECHEC', message: String(e && e.message || e) }); });
    } else if (message.nom === 'joindre') {
      stub.attach(message).catch((e) => { console.error('[gfs-stub] joindre en échec', e); if (Number.isInteger(message.id)) stub.post({ type: 'erreur', id: message.id, code: 'GFS_ECHEC', message: String(e && e.message || e) }); });
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
