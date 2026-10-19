// Ce que l'app fait d'une ouverture que GFS (Grist Factory Suite) lui demande - consigne GFS 010 : le modèle que GFS désigne s'ouvre, et le coin d'état dit pourquoi ; consigne 014 : « Nouveau » ouvre un modèle
// vierge du type demandé. Rien d'autre n'est écrit : ni le modèle de la vue (`modeleDeLaVue`), ni le ★, ni aucun réglage, ni aucune ligne de `Publipostage_Modeles` (un modèle vierge naît à son premier « Enregistrer », comme avec
// le bouton « Nouveau ») - la personne n'a pas d'« Enregistrer » à faire dans Grist.
//  - Au démarrage, l'`ouverture` du contexte (GfsLink.opening) passe avant l'ordre habituel de js/main.js (la ligne, le modèle de la vue, le ★). Sans modèle qui s'ouvre - rien demandé, introuvable, ou d'un type que la
//    garde « type inconnu » ne laisse pas ouvrir - l'ordre habituel reste, sans message d'erreur. « Nouveau » (pas de fichier, un `type`) ouvre à la place de cet ordre un modèle vierge de ce type : document, grille, email,
//    présentation (si GFS dit l'extension « diapositives » active) ; le macro-modèle n'a rien à charger, il ouvre son écran de composition, vide, par-dessus le modèle habituel, comme son bouton. Un `type` absent, que la garde
//    refuse, ou un document en lecture seule : l'ordre habituel. `dossier` n'est pas lu : le rangement de l'app est dans `Publipostage_PreferencesModeles`, le modèle arrive à la racine.
//  - L'app déjà ouverte reçoit l'appel `ouvrir` (GfsLink.onOpen) : un à la fois, après la fin du démarrage, par le chemin du sélecteur de modèles - donc avec sa question « Enregistrer / Abandonner /
//    Annuler » quand des modifications attendent. Pour « Nouveau », par celui du bouton « Nouveau » du même type (js/main.js `openBlankOfType`), question comprise. GFS reçoit `{ ouvert }` : vrai quand le modèle
//    demandé est ouvert à la fin (c'était déjà lui : rien ne change, rien n'est dit ; un modèle vierge : à l'écran, son avertissement « modèle non enregistré » intact ; un macro-modèle : son écran de composition est
//    ouvert), faux si la personne annule, si le modèle est introuvable ou refusé par la garde, si le type demandé est refusé, ou si le document est en lecture seule. Pas de délai : la personne peut prendre son temps.
// Seule (adresse sans `gfs=`), GfsLink ne rend aucune ouverture et n'appelle jamais : l'ordre d'arrivée est celui d'avant. Ce fichier n'écrit ni n'écoute aucun message : tout passe par js/gfs-link.js.
//   GfsOpen.init({ openTemplate(id) -> Promise<bool>, openBlank(type) -> Promise<bool>, say(text) })  s'inscrit à l'appel `ouvrir` ; `openTemplate` rend vrai si le modèle est ouvert à la fin, `openBlank` si le modèle
//                                                                                                       vierge de ce type l'est, `say` écrit dans le coin d'état
//   GfsOpen.startupTemplateId() -> Promise<id | null>               à attendre avant de choisir le modèle de départ
//   GfsOpen.startupBlankType() -> Promise<type | null>              le type du modèle vierge que « Nouveau » demande au démarrage, ou null : à attendre de même
//   GfsOpen.startupDone() / startupFailed()                         la fin du démarrage : dit pourquoi le modèle s'est ouvert ; libère (ou refuse) les appels `ouvrir` qui attendaient
const GfsOpen = (function () {
  // La raison de l'ouverture (contrats 5.2, point 3) -> la clé de sa phrase (js/i18n.js). Une raison que l'app ne connaît pas n'affiche rien ; « nouveau » non plus : le coin d'état garde l'avertissement « modèle
  // non enregistré » que pose l'ouverture d'un modèle vierge.
  const REASON_TEXT = new Map([['explorateur', 'status.openedFromExplorer']]);

  let hooks = null;
  let startupReason = '';    // la raison de l'ouverture du démarrage, dite quand le coin d'état a fini de dire « Widget prêt. »
  let queue = Promise.resolve();
  let settleStarted;
  // Vraie quand le démarrage est fini, fausse quand il a échoué : un appel `ouvrir` reçu avant attend cette fin.
  const started = new Promise((resolve) => { settleStarted = resolve; });

  // L'identifiant du modèle que cette ouverture désigne, ou null : pas de fichier, modèle introuvable, ou d'un type que la garde « type inconnu » (Templates.openableById) n'ouvre pas.
  function designated(opening) {
    const tpl = opening && opening.fichier ? Templates.openableById(opening.fichier.id) : undefined;
    return tpl ? tpl.id : null;
  }

  // Le type du modèle vierge que cette ouverture demande (« Nouveau » : pas de fichier et un type que la garde « type inconnu » laisse ouvrir), ou null. Un type absent n'en est pas un : la garde l'accepte pour un
  // ancien modèle, qui n'en a pas, mais ici c'est une ouverture mal formée.
  function requestedBlank(opening) {
    if (!opening || opening.fichier || !opening.type) return null;
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

  // Écrite après « Widget prêt. » : js/main.js l'appelle juste après ce message, avant les vérifications d'après ouverture, dont les avertissements passent après elle.
  function startupDone() {
    say(startupReason);
    settleStarted(true);
  }

  function startupFailed() { settleStarted(false); }

  async function open(opening) {
    const blank = requestedBlank(opening);
    if (blank !== null) return (await hooks.openBlank(blank)) === true;
    const id = designated(opening);
    if (id === null) return false;
    if (Templates.isCurrent(id)) return true;
    const opened = await hooks.openTemplate(id);
    if (opened) say(opening.raison);
    return opened === true;
  }

  // L'appel `ouvrir` : à la suite des précédents (la question d'enregistrement de l'un ne se pose pas par-dessus celle d'un autre) et après la fin du démarrage.
  function handleCall(opening) {
    const run = queue.then(() => started).then(ok => (ok ? open(opening) : false));
    queue = run.catch(() => {});
    return run;
  }

  function init(given) {
    hooks = given;
    GfsLink.onOpen(handleCall);
  }

  return { init, startupTemplateId, startupBlankType, startupDone, startupFailed };
})();
