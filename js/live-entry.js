// L'écriture en direct vue du socle du widget. Son moteur, son éditeur et son interface sont l'extension « édition » (extensions/edition/ : live-sync.js, live-channel.js, live-editor.js,
// live-control.js et sa feuille de style), que Grist Factory Suite (GFS) active ou non, et dont la bibliothèque - Yjs et les extensions de TipTap qui s'en servent, en UN fichier - lui vient de
// GFS (js/extensions.js, js/gfs-link.js). Ce fichier garde ce qui reste quand l'extension est absente et le SEUL point d'entrée par lequel le reste du widget (js/main.js, js/main-toolbar.js,
// js/header-footer-preview.js, js/editor-nodes.js...) l'atteint :
//  - le GRISÉ, sans l'extension : jamais caché. La ligne « Écriture en direct » du menu « Édition collaborative » est grisée avec sa raison et son clic explique (hébergé par GFS : ouvre sa fenêtre
//    d'installation, seul : une fenêtre simple dit qu'il faut passer par GFS - Extensions.explain). Même grisé quand le modèle ouvert n'a pas de sens pour elle (pas encore enregistré, pas un
//    document, document en lecture seule) ou que le fichier de GFS n'a pas pu être chargé (la ligne dit pourquoi, et son clic retente) ;
//  - l'ACTIVATION : le code de l'extension et le fichier de GFS ne se chargent qu'au premier clic, et seulement si GFS dit l'extension active ;
//  - l'ENTRÉE AUTOMATIQUE : quand une personne allume l'écriture en direct d'un modèle, celles qui l'ont ouvert - présentes ou arrivées ensuite - la rejoignent toutes seules, sans la question
//    « Rejoindre ? » (plus bas) ; la personne qui l'arrête, ou qui refuse de la rejoindre, n'y est pas ramenée avant d'avoir rouvert le modèle ;
//  - ce que le reste du widget doit savoir PENDANT l'écriture en direct, et qui est vrai ou vide quand elle est éteinte : `isLive` (les en-têtes et pieds, le suivi des modifications et les
//    tableaux grisent ce qui échangerait le texte de l'éditeur), `isRemote` (une transaction venue d'une autre personne : les corrections automatiques du widget ne la rejouent pas), `undo` et
//    `redo` (chacun n'annule que ses frappes), `blocksAutosave` et le jeton de l'enregistrement (UNE personne enregistre le modèle pour tout le monde), `releaseEditor` (changer de modèle ferme
//    l'écriture en direct avant que l'éditeur change de texte).
const LiveEntry = (function () {
  const ID = 'edition';
  const FEATURE_KEY = 'live.function';
  // La clé que le plugin de synchronisation de Yjs (ySyncPluginKey, `y-sync$`) pose sur une transaction venue d'ailleurs : { isChangeOrigin: true }. Écrite ici plutôt que prise de la bibliothèque,
  // qui n'est pas chargée tant que l'écriture en direct n'est pas allumée.
  const SYNC_META = 'y-sync$';

  let control = null;          // l'objet que l'extension pose (register) une fois chargée
  let context = () => ({ id: null, type: 'document', readOnly: false, dirty: false, modified: null });
  let hooks = { markUnsaved: () => {} };
  let starting = false;
  const listeners = new Set();

  // L'entrée automatique (voir plus bas). Le nom de la table du direct est celui de LiveChannel.TABLE_NAME : l'extension n'est pas chargée ici.
  const TABLE = 'Publipostage_Direct';
  const WATCH_MS = 3000;                            // une lecture de la table du direct toutes les 3 s tant que la personne pourrait rejoindre un salon
  const WATCH_IDLE_MS = 10000;                      // ... toutes les 10 s quand elle ne porte plus que des restes (une page fermée sans prévenir) : plus lourde à lire, rien à rejoindre (pace)
  const WATCH_RETRY_MS = [6000, 12000, 30000];      // après une lecture en échec : de plus en plus lent
  const ARRIVAL_MS = 400;                           // la première lecture d'un modèle ouvert attend que l'écran ait fini de le poser (js/main.js, loadTemplateIntoEditor)
  const PRESENT_MS = 60000;                         // une ligne de présence plus ancienne n'est plus une personne là : Yjs oublie une présence qui ne change plus depuis 30 s, et l'horloge de l'autre page peut retarder de quelques secondes
  const GIVE_UP = 3;                                // essais de rejoindre qui n'aboutissent pas, avant de laisser la personne le faire elle-même
  let automatic = true;
  let watchTimer = null;
  let watchFailures = 0;
  let tableSeen = false;      // la table du direct existe (une fois vue, elle reste)
  let epoch = 0;              // monte à chaque ouverture d'un modèle : une « arrivée »
  let seenId = null;
  let leftEpoch = -1;         // l'arrivée où la personne a quitté le direct ou refusé de le rejoindre : elle n'y est plus ramenée avant d'avoir rouvert le modèle
  let liveEpoch = -1;         // l'arrivée où le direct a été allumé
  let lastState = 'off';
  let baseEpoch = -1;
  let baseModified = null;    // la date d'enregistrement du modèle à l'arrivée
  let room = null;            // le dernier salon vivant vu sur le modèle ouvert : { saved }
  let tries = 0;

  // Posé par js/main.js : le modèle ouvert ({ id, type, readOnly, dirty, modified, idle }) tel que l'écran le montre (`dirty` : du texte tapé qui n'est pas encore enregistré ; `modified` : la date de
  // Grist du dernier enregistrement que ce widget connaît ; `idle` : faux quand l'écran est à autre chose qu'à ce texte - la Lecture, une question de départ, une restauration de version, un export,
  // un conflit à trancher, l'en-tête ou le pied en édition -, où l'entrée automatique ne remplace rien), et ce que l'écriture en direct peut lui demander (`markUnsaved` : tenir le texte affiché
  // pour « à enregistrer »).
  function setContext(fn) { context = fn; }
  function setHooks(next) { hooks = Object.assign(hooks, next); }
  const hasUnsavedEdits = () => !!context().dirty;
  const savedDate = () => context().modified;
  const markUnsaved = () => hooks.markUnsaved();
  // Posé par l'extension une fois chargée (extensions/edition/live-control.js) ; les abonnés à l'enregistrement qui l'attendaient lui sont passés.
  function register(next) {
    control = next;
    earlySaved.forEach(fn => control.onSaved(fn));
    earlySaved.clear();
  }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function changed() {
    noteState();
    noteArrival();
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.warn('[LiveEntry] abonné en échec', e); } });
    rearm(baseEpoch === epoch ? WATCH_MS : ARRIVAL_MS);
  }

  // L'état
  function state() {
    const own = control ? control.state() : 'off';
    return own === 'off' && starting ? 'starting' : own;
  }
  const isLive = () => state() === 'live';
  const isBusy = () => state() === 'starting' || state() === 'stopping';
  const isAvailable = () => Extensions.isActive(ID);

  // Pourquoi la ligne est grisée : { kind, text }, ou null quand elle est utilisable. `kind` : 'extension' (rien à faire ici : GFS), 'load' (le fichier de GFS n'a pas chargé : le clic retente),
  // 'template' (ce modèle-ci n'en veut pas). Éteinte comme allumée, la ligne reste utilisable : elle sert aussi à arrêter.
  function unavailable() {
    if (!isAvailable()) return { kind: 'extension', text: I18n.t('template.unavailable.extension', { name: Extensions.nameOf(ID) }) };
    if (isLive() || isBusy()) return null;
    const failure = Extensions.failureOf(ID);
    if (failure && !Extensions.isLoaded(ID)) return { kind: 'load', text: I18n.t('live.unavailable.loadFailed', { reason: failure }) };
    const shown = context();
    if (shown.readOnly) return { kind: 'template', text: I18n.t('live.unavailable.readOnly') };
    if (shown.type !== 'document') return { kind: 'template', text: I18n.t('live.unavailable.type') };
    if (shown.id == null) return { kind: 'template', text: I18n.t('live.unavailable.unsaved') };
    return null;
  }
  const reason = () => { const why = unavailable(); return why ? why.text : ''; };

  // Le geste de la ligne : explique quand elle est grisée, arrête quand l'écriture est allumée, sinon la commence. Rend vrai quand l'écriture en direct vient de commencer.
  async function toggle() {
    if (isBusy()) return false;
    const why = unavailable();
    if (why && why.kind === 'extension') { await Extensions.explain(ID, FEATURE_KEY); return false; }
    if (why && why.kind === 'template') {
      await Dialogs.notice({ title: I18n.t('live.unavailable.title'), message: why.text, closeLabel: I18n.t('common.close') });
      return false;
    }
    if (isLive()) { await control.stop(); return false; }
    starting = true;
    changed();
    try {
      try { await Extensions.ensure(ID); }
      catch (e) {
        console.warn('[LiveEntry] extension indisponible', e);
        starting = false;
        leftEpoch = epoch;
        changed();
        await Dialogs.notice({ title: I18n.t('live.failed.title'), message: I18n.t('live.failed.message', { extension: Extensions.nameOf(ID), reason: Extensions.failureOf(ID) || String((e && e.message) || e) }), closeLabel: I18n.t('common.close') });
        return false;
      }
      const started = await control.start();
      // La personne l'a demandé et n'y est pas (elle a refusé la question, ou cela a échoué) : l'entrée automatique ne la y ramène pas dans son dos.
      if (!started) leftEpoch = epoch;
      return started;
    } finally {
      starting = false;
      changed();
    }
  }

  // Changer de modèle (js/main.js, loadTemplateIntoEditor) ou recharger l'éditeur : l'éditeur est rendu tout de suite, sans attendre l'écriture d'adieu, qui finit seule.
  function releaseEditor() {
    arrive();
    if (control && control.state() !== 'off') control.releaseEditor();
  }
  function stop() { return control && control.state() !== 'off' ? control.stop() : Promise.resolve(); }

  // Une transaction venue d'une autre personne (ou du rendu initial du texte partagé) : le widget ne la corrige pas, la personne qui l'a tapée l'a déjà fait.
  function isRemote(transaction) {
    const meta = transaction && transaction.getMeta(SYNC_META);
    return !!(meta && meta.isChangeOrigin);
  }

  // Annuler et Rétablir, par personne : vrai quand l'écriture en direct s'en est chargée (l'historique de l'éditeur est alors remplacé par celui de Yjs, qui ne défait que les frappes d'ici).
  function undo() { return isLive() ? control.undo() : false; }
  function redo() { return isLive() ? control.redo() : false; }

  // L'enregistrement. Une seule personne - la première de la liste, celle dont le numéro est le plus bas parmi les pages visibles - enregistre le modèle pour tout le monde ; les autres ne
  // l'écrivent que pour un réglage qui leur est propre (nom, e-mail, marges...), `ownChanges`. Éteinte, rien ne change.
  const isScribe = () => isLive() && control.isScribe();
  const blocksAutosave = ownChanges => isLive() && !ownChanges && !control.isScribe();
  // Le texte est en train de s'accrocher à celui du salon (au démarrage) : ce que l'éditeur écrit alors n'est pas une frappe.
  const isSettingUp = () => !!control && control.isSettingUp();
  // L'état du document à l'instant où son texte va être lu pour l'enregistrer (à prendre juste avant), et l'annonce de l'enregistrement aux autres, une fois la date de Grist connue.
  const saveToken = () => (isLive() ? control.saveToken() : null);
  function published(token, modified) { if (token && isLive()) control.publishSaved(token, modified); }
  // Un enregistrement fait par une autre personne du direct : ({ modified, atState }) - la date de Grist, et si le document d'ici est dans l'état qu'elle a enregistré. Les abonnés qui arrivent
  // avant l'extension sont gardés et lui sont passés quand elle s'enregistre.
  const earlySaved = new Set();
  function onSaved(fn) {
    if (control) return control.onSaved(fn);
    earlySaved.add(fn);
    return () => earlySaved.delete(fn);
  }
  // Un changement d'enregistrement inconnu vu pendant que d'autres écrivent en direct : leur annonce arrive dans la seconde qui suit. Vrai tant qu'il faut attendre avant de crier au conflit.
  const expectsAnnouncement = () => isLive() && control.hasPeers();

  // Ce que la personne voit quand elle essaie de faire, pendant l'écriture en direct, ce qu'elle ferme (en-tête, pied de page, suivi des modifications).
  function lockedReason(key) { return isLive() ? I18n.t('live.locked.' + key) : ''; }
  function explainLocked(key) {
    return Dialogs.notice({ title: I18n.t('live.locked.title'), message: I18n.t('live.locked.' + key), closeLabel: I18n.t('common.close') });
  }

  // L'ENTRÉE AUTOMATIQUE
  // Quand une personne allume l'écriture en direct d'un modèle, celles qui l'ont ouvert - déjà là ou arrivées ensuite - la rejoignent toutes seules. Une page qui n'écrit pas en direct ne reçoit
  // aucune prévenance de la table du direct (Grist ne prévient un widget que des changements de la table de SA section, contrats de GFS 5.5) : le socle la relit donc de loin en loin, et
  // seulement quand rejoindre aurait un sens ici - l'extension est active, le modèle est un document enregistré que la personne n'a pas quitté, la page est visible, rien n'est à perdre à
  // l'écran. Sans salon vivant, c'est la liste des tables, puis la lecture de la table du direct, toutes les 3 s (toutes les 10 s quand elle ne porte plus que des restes) : ni le code de
  // l'extension ni le fichier de GFS ne sont demandés.
  // Un salon est VIVANT quand le modèle a son instantané et qu'une personne y est vraiment : une ligne de présence récente dont l'état n'est pas vide (la ligne que laisse une page fermée dit
  // « partie », et celle d'une page tombée sans prévenir vieillit). Rejoindre remplace le texte affiché par celui du groupe : jamais sans que la personne ait pu s'y attendre. Pas de texte à
  // enregistrer ; et soit la page n'a rien enregistré depuis son arrivée, soit le salon est parti d'un enregistrement au moins aussi récent que le sien (le repère « d » du salon). Sinon la ligne
  // du menu et sa question restent le chemin. Une personne qui arrête le direct, ou refuse de le rejoindre, n'y est pas ramenée avant d'avoir rouvert le modèle.
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const toNumber = (value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && isFinite(number) ? number : null;
  };
  const sameDate = (a, b) => {
    const x = toNumber(a);
    const y = toNumber(b);
    return x !== null && y !== null ? x === y : a === b;
  };

  // Une ligne de présence (la mise à jour de présence de y-protocols : le nombre de clients, puis pour chacun son numéro, son horloge et son état en JSON) dit-elle qu'une personne est là ?
  // L'état vide (`null`) est celui d'une personne partie. Une ligne illisible n'est pas une personne.
  function isHere(data) {
    try {
      const raw = atob(String(data));
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      let at = 0;
      const varUint = () => {
        let number = 0;
        let scale = 1;
        for (;;) {
          const byte = bytes[at++];
          if (byte === undefined) throw new Error('présence tronquée');
          number += (byte & 127) * scale;
          if (byte < 128) return number;
          scale *= 128;
        }
      };
      for (let clients = varUint(); clients > 0; clients--) {
        varUint();   // le numéro du client
        varUint();   // son horloge
        const length = varUint();
        const state = JSON.parse(new TextDecoder().decode(bytes.subarray(at, at + length)));
        at += length;
        if (state !== null) return true;
      }
    } catch (e) { /* illisible : ce n'est pas une personne */ }
    return false;
  }

  // Le salon vivant du modèle `doc` dans la table du direct lue en colonnes (fetchTable) : { saved } - la date du dernier enregistrement que le salon connaît (son repère « d »), ou null -, ou null
  // quand il n'y en a pas.
  function roomIn(table, doc, now) {
    if (!table || !table.id || !table.Doc || !table.Kind || !table.T || !table.Data) return null;
    let snapshot = false;
    let here = false;
    let saved = null;
    for (let i = 0; i < table.id.length; i++) {
      if (String(table.Doc[i]) !== doc) continue;
      const kind = table.Kind[i];
      if (kind === 's') snapshot = true;
      else if (kind === 'p') { if (now - Number(table.T[i]) <= PRESENT_MS && isHere(table.Data[i])) here = true; }
      else if (kind === 'd') { try { saved = toNumber(JSON.parse(table.Data[i]).modified); } catch (e) { saved = null; } }
    }
    return snapshot && here ? { saved } : null;
  }

  // Le délai avant la relecture, quand la table ne porte aucun salon vivant à rejoindre. Tant qu'elle porte une ligne récente - un salon qu'on est en train de fonder (son instantané précède sa
  // présence de quelques instants), une page qu'on vient de fermer, le direct d'un autre modèle -, la relecture garde son rythme : un salon peut naître à tout moment. Une table qui n'a plus que
  // des restes (une page fermée sans prévenir les laisse) est plus lourde à lire et n'a rien à offrir : elle se relit plus lentement.
  function pace(table, now) {
    if (!table.id || !table.id.length) return WATCH_MS;
    if (!table.T) return WATCH_IDLE_MS;
    for (let i = 0; i < table.T.length; i++) if (now - Number(table.T[i]) <= PRESENT_MS) return WATCH_MS;
    return WATCH_IDLE_MS;
  }

  // La personne pourrait rejoindre un direct sur ce modèle : l'entrée automatique est permise, l'extension active, le modèle un document enregistré qu'elle n'a pas quitté.
  const eligible = () => automatic && isAvailable() && leftEpoch !== epoch && unavailable() === null;
  const watchable = () => eligible() && !isLive() && !isBusy();
  // Rien à perdre à l'écran : la page est visible, le texte n'attend pas d'être enregistré et l'écran n'est pas à autre chose (la Lecture, une question de départ, un export, un conflit... : `idle`
  // de js/main.js).
  const calm = () => visible() && context().idle !== false && !hasUnsavedEdits();
  // Rejoindre remplace le texte affiché par celui du groupe. Sûr quand la page n'a rien enregistré depuis son arrivée ; sinon seulement si le salon est parti d'un enregistrement au moins aussi
  // récent que le sien : elle n'a alors rien que le groupe n'ait pas.
  function safeFor(found) {
    const shown = context();
    if (sameDate(shown.modified, baseModified)) return true;
    const mine = toNumber(shown.modified);
    return !!found && found.saved !== null && mine !== null && mine <= found.saved;
  }
  // La dernière vérification, à l'instant de rejoindre (le moteur la demande à la place de la question « Rejoindre ? » : extensions/edition/live-control.js).
  const mayJoinNow = () => eligible() && !isLive() && calm() && !!room && safeFor(room);

  // Une arrivée : un modèle vient de s'ouvrir (ou de se rouvrir). Ce que la personne en avait décidé est oublié.
  function arrive() {
    epoch++;
    tries = 0;
    room = null;
    clearTimeout(watchTimer);
    watchTimer = null;
  }
  function noteArrival() {
    const id = context().id;
    if (id !== seenId) { seenId = id; arrive(); }
  }
  // Ce que la personne a fait du direct, vu des changements d'état : un direct qui s'arrête dans la même arrivée qu'il a commencé (Arrêter de la ligne ou de la barre, un salon perdu) est « quitté » ;
  // celui que ferme l'ouverture d'un autre modèle (releaseEditor) ne l'est pas.
  function noteState() {
    const now = state();
    if (now === 'live' && lastState !== 'live') liveEpoch = epoch;
    else if (lastState === 'live' && now !== 'live' && liveEpoch === epoch) leftEpoch = epoch;
    lastState = now;
  }

  // La table du direct en colonnes, ou null quand elle n'existe pas encore (la première personne qui allume l'écriture en direct la crée).
  async function readDirect() {
    const docApi = window.grist && window.grist.docApi;
    if (!docApi) return null;
    if (!tableSeen) {
      const names = await docApi.listTables();
      if (!Array.isArray(names) || !names.includes(TABLE)) return null;
      tableSeen = true;
    }
    try { return await docApi.fetchTable(TABLE); }
    catch (e) { tableSeen = false; throw e; }
  }

  async function join(arrival) {
    tries++;
    starting = true;
    changed();
    let joined = false;
    try {
      await Extensions.ensure(ID);
      if (epoch === arrival && mayJoinNow()) joined = await control.start({ automatic: true });
    } catch (e) {
      console.warn('[LiveEntry] entrée automatique en échec', e);
    } finally {
      starting = false;
      changed();
    }
    if (joined) tries = 0;
    else if (tries >= GIVE_UP) leftEpoch = epoch;
  }

  // Une vérification. Rend le délai avant la suivante.
  async function look() {
    if (!watchable()) return WATCH_MS;
    const shown = context();
    if (baseEpoch !== epoch) { baseEpoch = epoch; baseModified = shown.modified; }
    if (!calm()) return WATCH_MS;
    const arrival = epoch;
    const table = await readDirect();
    if (table === null) return WATCH_MS;
    if (epoch !== arrival || String(context().id) !== String(shown.id) || !watchable() || !calm()) return WATCH_MS;
    const now = Date.now();
    room = roomIn(table, String(shown.id), now);
    if (!room) return pace(table, now);
    if (!mayJoinNow()) return WATCH_MS;
    await join(arrival);
    return WATCH_MS;
  }
  async function watch() {
    let wait;
    try {
      wait = await look();
      watchFailures = 0;
    } catch (e) {
      watchFailures++;
      wait = WATCH_RETRY_MS[Math.min(watchFailures, WATCH_RETRY_MS.length) - 1];
    }
    rearm(wait);
  }
  function rearm(delay) {
    if (watchTimer !== null || !watchable()) return;
    watchTimer = setTimeout(() => { watchTimer = null; watch(); }, delay);
  }
  function nudge() {
    clearTimeout(watchTimer);
    watchTimer = null;
    rearm(0);
  }
  // Permet ou coupe l'entrée automatique (permise au départ ; les essais qui parlent de la question « Rejoindre ? » la coupent).
  function setAutomatic(on) {
    automatic = on !== false;
    if (automatic) nudge(); else { clearTimeout(watchTimer); watchTimer = null; }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (visible()) nudge(); });

  Extensions.onChange(changed);

  return {
    ID, FEATURE_KEY, register, setContext, setHooks, onChange, changed, state, isLive, isBusy, isAvailable, unavailable, reason, toggle, stop, releaseEditor, isRemote, undo, redo,
    hasUnsavedEdits, savedDate, markUnsaved, isScribe, isSettingUp, blocksAutosave, saveToken, published, onSaved, expectsAnnouncement, lockedReason, explainLocked, setAutomatic, mayJoinNow,
  };
})();
