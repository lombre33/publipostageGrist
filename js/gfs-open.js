// Ce que l'app fait d'une ouverture que GFS (Grist Factory Suite) lui demande - consigne GFS 010 : le modèle que GFS désigne s'ouvre, et le coin d'état dit pourquoi ; consigne 014 : « Nouveau » ouvre un modèle
// vierge du type demandé ; consigne 035 : « Nouveau > Importer » donne à l'app le fichier que GFS a fait choisir, et l'app l'importe. Rien d'autre n'est écrit : ni le modèle de la vue (`modeleDeLaVue`), ni le ★, ni
// aucun réglage, ni aucune ligne de `Publipostage_Modeles` (un modèle vierge naît à son premier « Enregistrer », comme avec le bouton « Nouveau ») - la personne n'a pas d'« Enregistrer » à faire dans Grist.
//  - Au démarrage, l'`ouverture` du contexte (GfsLink.opening) passe avant l'ordre habituel de js/main.js (la ligne, le modèle de la vue, le ★). Sans modèle qui s'ouvre - rien demandé, introuvable, ou d'un type que la
//    garde « type inconnu » ne laisse pas ouvrir - l'ordre habituel reste, sans message d'erreur. « Nouveau » (pas de fichier, un `type`) ouvre à la place de cet ordre un modèle vierge de ce type : document, grille, email,
//    présentation (si GFS dit l'extension « diapositives » active) ; le macro-modèle n'a rien à charger, il ouvre son écran de composition, vide, par-dessus le modèle habituel, comme son bouton. Un `type` absent, que la garde
//    refuse, ou un document en lecture seule : l'ordre habituel. `dossier` n'est pas lu : le rangement de l'app est dans `Publipostage_PreferencesModeles`, le modèle arrive à la racine.
//    Une ouverture de raison `importer` porte `importation: { valeur: 'excel' | 'markdown' | 'powerpoint', fichier: File }` (GFS a ouvert le sélecteur de fichier lui-même, le cadre isolé de l'app n'a pas le geste de la
//    personne, et ne donne le fichier qu'une fois) : ce n'est jamais un « Nouveau » du type, ni un modèle à ouvrir. La valeur désigne l'import du menu « + » (js/main.js `importFileFromGfs` : un classeur Excel, un
//    Markdown, un PowerPoint), qui lit le fichier reçu à la place de celui du sélecteur, avec les mêmes refus, les mêmes phrases du coin d'état et la même question « Enregistrer / Abandonner / Annuler » après une lecture
//    réussie ; le résultat est un modèle sans nom et pas encore enregistré. Une valeur inconnue, une importation illisible (js/gfs-link.js ne la garde que bien formée), un fichier refusé, une personne qui annule ou
//    un document en lecture seule : rien n'est ouvert, et jamais un modèle vierge à la place (il ferait perdre le fichier sans un mot). Au démarrage, l'ordre habituel ouvre d'abord son modèle et « Widget prêt. » se
//    dit, puis l'import suit (avant les appels `ouvrir` qui attendaient) : ses phrases du coin d'état ne sont pas recouvertes par celle du démarrage et les erreurs de lecture restent à l'écran.
//    Une ouverture de raison `lire` porte `lecture: { id, fichier: File }` (consigne 040 : GFS garde le PDF, le télécharge lui-même et le donne, une seule fois) : ce n'est jamais un « Nouveau » du type, ni un
//    modèle à ouvrir, ni l'ordre habituel qui prend sa place (le PDF serait perdu sans un mot). Le PDF se lit par js/pdf-reading.js (hook `readPdf` de js/main.js, extension « lecture-pdf ») dans le mode Lecture ;
//    la question « Enregistrer / Abandonner / Annuler » d'un modèle modifié se pose avant de le quitter, après la lecture du PDF (un PDF illisible ne coûte rien). Une ouverture `lire` sans `lecture` bien formée
//    (js/gfs-link.js ne la garde que bien formée) n'ouvre rien, et jamais un modèle vierge à la place. Au démarrage, comme l'import : l'ordre habituel ouvre son modèle, « Widget prêt. » se dit, puis le PDF le
//    remplace (avant les appels `ouvrir` qui attendaient) ; un PDF qui ne s'ouvre pas laisse le modèle habituel, et le coin d'état dit pourquoi.
//  - L'app déjà ouverte reçoit l'appel `ouvrir` (GfsLink.onOpen) : un à la fois, après la fin du démarrage, par le chemin du sélecteur de modèles - donc avec sa question « Enregistrer / Abandonner /
//    Annuler » quand des modifications attendent encore (voir plus bas ce que l'enregistrement automatique allumé en a déjà enregistré). Pour « Nouveau », par celui du bouton « Nouveau » du même type (js/main.js `openBlankOfType`), question comprise. GFS reçoit `{ ouvert }` : vrai quand le modèle
//    demandé (ou importé) est ouvert à la fin (c'était déjà lui : rien ne change, rien n'est dit ; un modèle vierge : à l'écran, son avertissement « modèle non enregistré » intact ; un macro-modèle : son écran de composition est
//    ouvert), faux si la personne annule, si le modèle est introuvable ou refusé par la garde, si le type demandé est refusé, si le fichier à importer est refusé, ou si le document est en lecture seule. Pas de délai : la personne peut prendre son temps.
//    Avant de quitter le modèle à l'écran pour celui-là (un modèle, un vierge, un import, un PDF), ce qui attend d'être enregistré l'est (consigne GFS 047, hook `saveBeforeLeaving`) : sans question quand l'enregistrement
//    automatique est allumé, la personne ayant dit en l'allumant qu'elle veut que l'app enregistre ; la question ci-dessus ne reste que pour ce que l'app ne peut pas décider seule (js/main.js `saveBeforeGfsLeaves` :
//    enregistrement automatique coupé, modèle sans nom, modèle changé ailleurs, écriture refusée). Un appel qui n'ouvre rien (déjà ouvert, introuvable, refusé) n'enregistre rien de plus que ne le ferait l'enregistrement automatique.
//  - L'app reçoit aussi l'appel `fermer { raison }` (GfsLink.onClose, consigne 047) : GFS va détruire son cadre pour laisser la place à une autre app ou au fichier d'une autre app, et attend `{ ferme }`. L'app répond d'après
//    l'état de ses données (js/main.js `leaveForGfs`) : rien n'attend, ou tout a été enregistré (enregistrement automatique allumé) : vrai tout de suite, sans question ; sinon sa question « Enregistrer / Abandonner / Annuler »
//    (« Annuler » : faux, tout reste en place). Elle ne se ferme pas d'elle-même et ne répond jamais vrai avant d'avoir fini d'écrire. La réponse ne dépend ni de la raison ni du démarrage : un `fermer` reçu avant
//    l'inscription attend `init`, un autre pendant que le démarrage s'achève trouve un modèle sans rien à enregistrer.
// Seule (adresse sans `gfs=`), GfsLink ne rend aucune ouverture et n'appelle jamais : l'ordre d'arrivée est celui d'avant. Ce fichier n'écrit ni n'écoute aucun message : tout passe par js/gfs-link.js.
//   GfsOpen.init({ openTemplate(id) -> Promise<bool>, openBlank(type) -> Promise<bool>, importFile(valeur, fichier) -> Promise<bool>, readPdf(lecture) -> Promise<bool>, say(text), saveBeforeLeaving() -> Promise,
//                  leave(raison) -> Promise<bool> })  s'inscrit aux appels `ouvrir` et `fermer` ;
//                                                                                                       `openTemplate` rend vrai si le modèle est ouvert à la fin, `openBlank` si le modèle vierge de ce type l'est,
//                                                                                                       `importFile` si le modèle importé de ce fichier l'est, `readPdf` si le PDF (`lecture`) est lu à l'écran,
//                                                                                                       `say` écrit dans le coin d'état, `saveBeforeLeaving` enregistre ce qui attend avant qu'un autre fichier
//                                                                                                       s'ouvre (sans rien poser comme question), `leave` répond à `fermer` : vrai si l'app peut laisser la place
//   GfsOpen.startupTemplateId() -> Promise<id | null>               à attendre avant de choisir le modèle de départ
//   GfsOpen.startupBlankType() -> Promise<type | null>              le type du modèle vierge que « Nouveau » demande au démarrage, ou null : à attendre de même
//   GfsOpen.startupDone() / startupFailed()                         la fin du démarrage : dit pourquoi le modèle s'est ouvert, lance l'import que l'ouverture demandait ; libère (ou refuse) les appels `ouvrir` qui attendaient
const GfsOpen = (function () {
  // La raison de l'ouverture (contrats 5.2, point 3) -> la clé de sa phrase (js/i18n.js). Une raison que l'app ne connaît pas n'affiche rien ; « nouveau » non plus : le coin d'état garde l'avertissement « modèle
  // non enregistré » que pose l'ouverture d'un modèle vierge.
  const REASON_TEXT = new Map([['explorateur', 'status.openedFromExplorer']]);

  let hooks = null;
  let startupReason = '';    // la raison de l'ouverture du démarrage, dite quand le coin d'état a fini de dire « Widget prêt. »
  let queue = Promise.resolve();
  let startupTask = Promise.resolve();   // l'import ou la lecture de PDF que l'ouverture du démarrage demande, lancé par startupDone : les appels `ouvrir` qui attendaient passent après lui
  let settleStarted;
  // Vraie quand le démarrage est fini, fausse quand il a échoué : un appel `ouvrir` reçu avant attend cette fin.
  const started = new Promise((resolve) => { settleStarted = resolve; });

  // Une ouverture de raison `importer` (consigne 035) : GFS donne le fichier à importer. Elle n'est ni le modèle d'un fichier ni un « Nouveau » du type, même quand son importation est illisible.
  const isImport = opening => !!opening && opening.raison === 'importer';

  // Une ouverture de raison `lire` (consigne 040) : GFS donne un PDF à lire. Elle n'est ni le modèle d'un fichier ni un « Nouveau » du type, même quand sa `lecture` est illisible (js/gfs-link.js ne la garde que bien formée).
  const isReading = opening => !!opening && opening.raison === 'lire';

  // L'identifiant du modèle que cette ouverture désigne, ou null : pas de fichier, modèle introuvable, ou d'un type que la garde « type inconnu » (Templates.openableById) n'ouvre pas.
  function designated(opening) {
    const tpl = opening && opening.fichier && !isImport(opening) && !isReading(opening) ? Templates.openableById(opening.fichier.id) : undefined;
    return tpl ? tpl.id : null;
  }

  // Le type du modèle vierge que cette ouverture demande (« Nouveau » : pas de fichier et un type que la garde « type inconnu » laisse ouvrir), ou null. Un type absent n'en est pas un : la garde l'accepte pour un
  // ancien modèle, qui n'en a pas, mais ici c'est une ouverture mal formée.
  function requestedBlank(opening) {
    if (!opening || opening.fichier || !opening.type || isImport(opening) || isReading(opening)) return null;
    return Templates.isOpenableType(opening.type) ? opening.type : null;
  }

  function say(reason) {
    const key = REASON_TEXT.get(reason);
    if (key && hooks) hooks.say(I18n.t(key));
  }

  async function startupTemplateId() {
    await GfsLink.ready;
    const opening = GfsLink.opening();
    const id = designated(opening);
    startupReason = id === null ? '' : opening.raison;
    return id;
  }

  async function startupBlankType() {
    await GfsLink.ready;
    return requestedBlank(GfsLink.opening());
  }

  // Écrite après « Widget prêt. » : js/main.js l'appelle juste après ce message, avant les vérifications d'après ouverture, dont les avertissements passent après elle. L'import que l'ouverture demande
  // (consigne 035) ne commence qu'à la fin de ce tour, quand ces vérifications ont fini d'écrire dans le coin d'état : ses phrases (« Lecture… », le refus, « importé ») ne sont pas recouvertes.
  function startupDone() {
    say(startupReason);
    const opening = GfsLink.opening();
    if (isImport(opening)) {
      startupTask = Promise.resolve().then(() => importFrom(opening)).catch((e) => { console.warn('[GfsOpen] import demandé au démarrage en échec', e); return false; });
    } else if (isReading(opening)) {
      startupTask = Promise.resolve().then(() => readFrom(opening)).catch((e) => { console.warn('[GfsOpen] lecture de PDF demandée au démarrage en échec', e); return false; });
    }
    settleStarted(true);
  }

  function startupFailed() { settleStarted(false); }

  // L'import que cette ouverture demande : vrai quand le modèle importé est ouvert à la fin ; faux sans importation lisible, pour une valeur que l'app ne connaît pas, un fichier refusé, une personne qui annule
  // ou un document en lecture seule (js/main.js `importFileFromGfs`).
  async function importFrom(opening) {
    const wanted = opening.importation;
    if (!wanted) return false;
    return (await hooks.importFile(wanted.valeur, wanted.fichier)) === true;
  }

  // Le PDF que cette ouverture demande de lire : vrai quand il est lu à l'écran à la fin ; faux sans `lecture` bien formée, quand le PDF est illisible, vide ou refusé, ou quand la personne annule (js/main.js `readPdfFromGfs`).
  async function readFrom(opening) {
    const wanted = opening.lecture;
    if (!wanted) return false;
    return (await hooks.readPdf(wanted)) === true;
  }

  // Ce qui attend d'être enregistré l'est avant de quitter le modèle à l'écran pour celui-ci (consigne 047) : js/main.js `saveBeforeGfsLeaves`, qui ne pose aucune question.
  const settle = () => hooks.saveBeforeLeaving();

  async function open(opening) {
    if (isImport(opening)) {
      if (opening.importation) await settle();
      return importFrom(opening);
    }
    if (isReading(opening)) {
      if (opening.lecture) await settle();
      return readFrom(opening);
    }
    const blank = requestedBlank(opening);
    if (blank !== null) {
      await settle();
      return (await hooks.openBlank(blank)) === true;
    }
    const id = designated(opening);
    if (id === null) return false;
    if (Templates.isCurrent(id)) return true;
    await settle();
    const opened = await hooks.openTemplate(id);
    if (opened) say(opening.raison);
    return opened === true;
  }

  // L'appel `ouvrir` : à la suite des précédents (la question d'enregistrement de l'un ne se pose pas par-dessus celle d'un autre) et après la fin du démarrage.
  function handleCall(opening) {
    const run = queue.then(() => started).then(ok => (ok ? startupTask.then(() => open(opening)) : false));
    queue = run.catch(() => {});
    return run;
  }

  // L'appel `fermer` (consigne 047) : l'app répond d'après l'état de ses données, tout de suite - GFS n'attend pas la fin d'une ouverture qu'une question retient, et sa propre fenêtre « ne répond pas » vient au bout de 10 secondes.
  function handleClose(reason) {
    return hooks.leave(reason);
  }

  function init(given) {
    hooks = given;
    GfsLink.onOpen(handleCall);
    GfsLink.onClose(handleClose);
  }

  return { init, startupTemplateId, startupBlankType, startupDone, startupFailed };
})();
