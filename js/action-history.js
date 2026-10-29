// Les actions qui visent plus que le modèle ouvert, dans l'historique d'Annuler / Rétablir (Ctrl + Z, Ctrl + Y, Ctrl + Maj + Z, boutons de la barre) : le ★ du document, les épingles et les dossiers de la bibliothèque, la suppression et
// la création d'un modèle, les règles de liaison entre tables, les Réglages.
//
// L'historique de l'éditeur est celui du modèle ouvert, et Editor.setHTML le vide à chaque modèle chargé (js/history-markers.js). Or ces actions se défont depuis n'importe quel modèle : supprimer un modèle ouvre un document vierge, et
// Ctrl + Z doit pourtant le rendre. Ce module garde donc de quoi défaire et refaire chaque action (`add`, une fois l'action FAITE), et le nouvel historique reçoit à chaque modèle chargé le repère de celles qui sont faites (`reseed`) :
// l'ordre des gestes, les frappes mêlées aux actions, le bouton, la touche et le menu Édition du navigateur restent ceux de l'historique de l'éditeur, qui défait un repère en appelant `sync`.
//
// Une action est { undo, redo } : deux fonctions asynchrones qui rendent le texte du coin d'état (ce qui vient d'être défait ou rétabli) ou lèvent une erreur. `conflict(message)` est l'erreur d'une action qui ne peut plus se défaire
// parce que le document a changé depuis (un autre modèle par défaut, un modèle supprimé par quelqu'un d'autre) : rien n'est écrit, et le message le dit au lieu d'écraser le geste d'une autre personne. Les actions se suivent l'une
// après l'autre, dans l'ordre où l'historique les rend (deux Ctrl + Z de suite défont la deuxième action puis la première). Une action neuve efface ce qui se rétablissait, comme une frappe.
//
// Les actions défaites sont gardées jusqu'à la prochaine action ou au prochain modèle chargé : le nouvel historique n'a plus de Rétablir. Au plus LIMIT actions, les plus anciennes partent d'abord. Une page rechargée repart de zéro.
const ActionHistory = (function () {
  const LIMIT = 30;

  let host = { status: () => {} };
  let seq = 0;
  // numéro -> { id, done, want, busy, undo, redo } ; l'ordre d'insertion est l'ordre des actions. `done` : l'action est faite (pas défaite) ; `want` : l'état que l'historique de l'éditeur lui demande, le dernier en date - deux touches
  // appuyées sans attendre se suivent avant que la première ait fini d'écrire ; `busy` : un Annuler ou un Rétablir la rend en ce moment.
  const entries = new Map();
  let queue = Promise.resolve();

  // `status(texte, erreur)` : le coin d'état de la page (js/main.js).
  function wire(options) { host = Object.assign({}, host, options); }

  function conflict(message) {
    const error = new Error(message);
    error.conflict = true;
    return error;
  }

  function forgetUndone() {
    entries.forEach((entry, id) => { if (!entry.want && !entry.busy) entries.delete(id); });
  }

  // L'action vient d'être faite : elle s'ajoute à la fin de l'historique, avec son repère. Rend son numéro.
  function add(action) {
    forgetUndone();
    const id = ++seq;
    entries.set(id, { id, done: true, want: true, busy: false, undo: action.undo, redo: action.redo });
    while (entries.size > LIMIT) entries.delete(entries.keys().next().value);
    HistoryMarkers.recordAction(id);
    return id;
  }

  // Amène l'action à l'état voulu : rien à faire s'il est déjà atteint (un Annuler suivi aussitôt d'un Rétablir se compense sans écrire).
  async function run(entry) {
    const done = entry.want;
    if (entry.done === done) return;
    entry.busy = true;
    try {
      const message = await (done ? entry.redo : entry.undo)();
      entry.done = done;
      if (message) host.status(message, false);
    } catch (error) {
      if (!error || !error.conflict) console.error('[ActionHistory] ' + (done ? 'rétablir' : 'défaire') + ' a échoué', error);
      host.status(error && error.conflict ? error.message : I18n.t(done ? 'history.redoFailed' : 'history.undoFailed'), true);
    } finally {
      entry.busy = false;
    }
  }

  // L'historique de l'éditeur rend un repère (`state` : { id, done }, l'état que le repère décrit après le retour) : l'action passera à cet état, après celles qui sont en route. Un repère dont l'action est partie, ou déjà dans cet
  // état (un Annuler qui a échoué, puis un Rétablir), ne fait rien.
  function sync(state) {
    const entry = state && entries.get(state.id);
    if (!entry) return;
    entry.want = !!state.done;
    queue = queue.then(() => run(entry));
  }

  // Un nouveau modèle, un nouvel historique : les actions faites y reposent leur repère, dans l'ordre. Celles qu'il fallait rétablir n'ont plus de repère à rétablir, ni celle qui est en train de se défaire quand c'est elle qui
  // vient de charger le modèle (défaire une suppression rouvre le modèle) : son repère dirait « faite » d'une action qui ne l'est plus.
  function reseed() {
    forgetUndone();
    entries.forEach(entry => { if (entry.want) HistoryMarkers.recordAction(entry.id); });
  }

  // Les essais : rendre la main une fois les actions en route finies, et repartir de zéro.
  const whenIdle = () => queue;
  function reset() {
    entries.clear();
    queue = Promise.resolve();
  }
  const count = () => entries.size;

  return { wire, add, sync, reseed, conflict, whenIdle, reset, count };
})();
