// L'écriture en direct vue du socle du widget. Son moteur, son éditeur et son interface sont l'extension « édition » (extensions/edition/ : live-sync.js, live-channel.js, live-editor.js,
// live-control.js et sa feuille de style), que Grist Factory Suite (GFS) active ou non, et dont la bibliothèque - Yjs et les extensions de TipTap qui s'en servent, en UN fichier - lui vient de
// GFS (js/extensions.js, js/gfs-link.js). Ce fichier garde ce qui reste quand l'extension est absente et le SEUL point d'entrée par lequel le reste du widget (js/main.js, js/main-toolbar.js,
// js/header-footer-preview.js, js/editor-nodes.js...) l'atteint :
//  - le GRISÉ, sans l'extension : jamais caché. La ligne « Écriture en direct » du menu « Édition collaborative » est grisée avec sa raison et son clic explique (hébergé par GFS : ouvre sa fenêtre
//    d'installation, seul : une fenêtre simple dit qu'il faut passer par GFS - Extensions.explain). Même grisé quand le modèle ouvert n'a pas de sens pour elle (pas encore enregistré, pas un
//    document, document en lecture seule) ou que le fichier de GFS n'a pas pu être chargé (la ligne dit pourquoi, et son clic retente) ;
//  - l'ACTIVATION : le code de l'extension et le fichier de GFS ne se chargent qu'au premier clic, et seulement si GFS dit l'extension active ;
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

  // Posé par js/main.js : le modèle ouvert ({ id, type, readOnly, dirty, modified }) tel que l'écran le montre (`dirty` : du texte tapé qui n'est pas encore enregistré ; `modified` : la date de
  // Grist du dernier enregistrement que ce widget connaît), et ce que l'écriture en direct peut lui demander (`markUnsaved` : tenir le texte affiché pour « à enregistrer »).
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
  function changed() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.warn('[LiveEntry] abonné en échec', e); } }); }

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
        changed();
        await Dialogs.notice({ title: I18n.t('live.failed.title'), message: I18n.t('live.failed.message', { extension: Extensions.nameOf(ID), reason: Extensions.failureOf(ID) || String((e && e.message) || e) }), closeLabel: I18n.t('common.close') });
        return false;
      }
      return await control.start();
    } finally {
      starting = false;
      changed();
    }
  }

  // Changer de modèle (js/main.js, loadTemplateIntoEditor) ou recharger l'éditeur : l'éditeur est rendu tout de suite, sans attendre l'écriture d'adieu, qui finit seule.
  function releaseEditor() { if (control && control.state() !== 'off') control.releaseEditor(); }
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

  Extensions.onChange(changed);

  return {
    ID, FEATURE_KEY, register, setContext, setHooks, onChange, changed, state, isLive, isBusy, isAvailable, unavailable, reason, toggle, stop, releaseEditor, isRemote, undo, redo,
    hasUnsavedEdits, savedDate, markUnsaved, isScribe, isSettingUp, blocksAutosave, saveToken, published, onSaved, expectsAnnouncement, lockedReason, explainLocked,
  };
})();
