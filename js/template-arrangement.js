// Le rangement des modèles de la personne (js/template-preferences.js) dans l'historique d'Annuler / Rétablir : l'épingle d'un modèle, le dossier où il est rangé, l'état « replié par défaut » d'un dossier, un dossier vide créé ou supprimé. Les deux écrans qui le
// changent - la liste des modèles (js/template-tree-select.js) et la fenêtre « Organiser mes modèles » (js/template-organize-modal.js) - passent par ici au lieu d'écrire dans les préférences : le geste est écrit, puis posé dans la
// pile de js/action-history.js, d'où Ctrl + Z, Ctrl + Y, Ctrl + Maj + Z et les boutons de la barre le défont depuis n'importe quel modèle (le rangement vise la bibliothèque, pas le modèle ouvert, comme le ★ du document).
//
// Défaire rend l'état d'AVANT le geste, rétablir celui d'APRÈS, tels quels : le rangement est personnel, personne d'autre ne l'a changé. Un modèle supprimé entre-temps n'est pas rangé de nouveau : rien n'est écrit et le coin
// d'état le dit. Un geste qui ne change rien (épingler un modèle déjà épinglé, le ranger où il est) s'écrit comme avant mais ne laisse pas de pas à défaire. Un échec d'écriture n'en laisse pas non plus.
// Une ligne d'état fait exister un dossier (consigne 072 de GFS : un dossier existe tant qu'une ligne le nomme, même sans modèle) : le geste qui la POSE la retire quand on le défait, sinon Ctrl + Z
// laisserait un dossier vide là où il n'y en avait pas. Si la ligne existait déjà avant le geste (un dossier venu de GFS), défaire lui rend seulement son état.
// Créer un dossier vide (« Nouveau dossier ») pose cette ligne, le supprimer la retire : l'un se défait en retirant la ligne, l'autre en la reposant avec l'état « replié par défaut » qu'elle avait.
// Seul un dossier VIDE (ni modèle ni sous-dossier) se supprime ; un dossier qui n'est plus vide au moment de défaire ou de rétablir reste en place, et le message le dit.
const TemplateArrangement = (function () {
  const asPath = path => TemplatePreferences.normalizeFolderPath(path) || '';

  // Ce que l'écran montre une fois le rangement changé par Ctrl + Z ou Ctrl + Y : la liste des modèles, et la fenêtre « Organiser » quand elle est ouverte.
  function redraw() {
    TemplateTreeSelect.refresh();
    TemplateOrganizeModal.refresh();
  }

  // Le modèle `id` tel que la liste le garde, ou le conflit « il n'existe plus » : on ne range pas une ligne qui n'est plus là.
  function templateOf(id) {
    const tpl = Templates.byId(id);
    if (!tpl) throw ActionHistory.conflict(I18n.t('history.templateGone'));
    return tpl;
  }

  function pinAction(id, from, to) {
    async function put(target) {
      const tpl = templateOf(id);
      await TemplatePreferences.setPinned(id, target);
      redraw();
      return I18n.t(target ? 'status.templatePinned' : 'status.templateUnpinned', { name: tpl.nom });
    }
    return { undo: () => put(from), redo: () => put(to) };
  }

  function moveAction(id, from, to) {
    async function put(target) {
      const tpl = templateOf(id);
      await TemplatePreferences.setFolder(id, target);
      redraw();
      return target ? I18n.t('status.templateMoved', { name: tpl.nom, folder: target }) : I18n.t('status.templateUnfiled', { name: tpl.nom });
    }
    return { undo: () => put(from), redo: () => put(to) };
  }

  // L'état « replié par défaut » du dossier `path` : rendu à `before` ({ was, existed }), ou posé replié quand `before` est nul. Sans ligne avant, défaire retire la ligne.
  async function restoreFold(path, before) {
    if (!before) await TemplatePreferences.setFolderCollapsed(path, true);
    else if (before.existed) await TemplatePreferences.setFolderCollapsed(path, before.was);
    else await TemplatePreferences.clearFolderState(path);
  }

  function foldAction(path, from, to, existed) {
    async function put(target, undoing) {
      await restoreFold(path, undoing ? { was: from, existed } : (target ? null : { was: false, existed: true }));
      redraw();
      return I18n.t(target ? 'status.folderCollapsed' : 'status.folderExpanded', { folder: path });
    }
    return { undo: () => put(from, true), redo: () => put(to, false) };
  }

  // Le dossier est-il, d'après ce que la liste montre, un dossier sans modèle ni sous-dossier ? Un dossier qui n'est pas dans la liste n'est pas vide : il n'y est pas.
  function treeFolder(path) {
    return TemplateOrganizer.findFolder(TemplateOrganizer.buildView(Templates.getCached(), TemplatePreferences.getCached(), TemplatePreferences.listStateFolders()).tree, path);
  }

  // Le dossier vide `path` créé (`created` vrai) ou supprimé : défaire une création retire sa ligne d'état, défaire une suppression la repose avec `collapsed`, l'état « replié par défaut » qu'elle avait ; rétablir
  // refait l'autre sens. Un dossier qu'un modèle occupe maintenant ne se retire pas : un conflit, rien n'est écrit.
  function folderAction(path, collapsed, created) {
    async function put(present) {
      if (present) {
        await TemplatePreferences.createFolderState(path, collapsed);
      } else {
        const node = treeFolder(path);
        if (node && node.enfants.length) throw ActionHistory.conflict(I18n.t('history.folderNotEmpty', { folder: path }));
        await TemplatePreferences.clearFolderState(path);
      }
      redraw();
      return I18n.t(present ? 'status.folderCreated' : 'status.folderDeleted', { folder: path });
    }
    return { undo: () => put(!created), redo: () => put(created) };
  }

  // Épingle (ou désépingle) le modèle `id` pour la personne.
  async function pin(id, pinned) {
    const before = TemplatePreferences.isPinned(id);
    await TemplatePreferences.setPinned(id, pinned);
    if (before !== !!pinned) ActionHistory.add(pinAction(id, before, !!pinned));
  }

  // Range le modèle `id` dans le dossier `path` ('' : hors de tout dossier).
  async function moveTo(id, path) {
    const before = asPath(TemplatePreferences.getFolder(id));
    const target = asPath(path);
    await TemplatePreferences.setFolder(id, target);
    if (before !== target) ActionHistory.add(moveAction(id, before, target));
  }

  // Règle le dossier `path` replié (ou déplié) par défaut dans la liste. L'état change tout de suite, avant l'écriture : l'écran qui appelle se redessine sans attendre Grist, puis attend la promesse rendue (qui lève si Grist refuse,
  // l'état est alors revenu au dernier état confirmé).
  async function foldByDefault(path, collapsed) {
    const key = asPath(path);
    const before = TemplatePreferences.isFolderCollapsed(key);
    const existed = TemplatePreferences.hasFolderState(key);
    await TemplatePreferences.setFolderCollapsed(key, collapsed);
    if (key && before !== !!collapsed) ActionHistory.add(foldAction(key, before, !!collapsed, existed));
  }

  // Crée le dossier vide `path` : sa ligne d'état, que GFS voit aussi. Rend `false` sans rien écrire quand la liste montre déjà ce dossier (un modèle ou une ligne d'état le nomme, ou un dossier plus
  // profond le contient) ; sinon un pas à défaire. Lève si Grist refuse l'écriture : aucun dossier n'est alors montré.
  async function createFolder(path) {
    const key = asPath(path);
    if (!key || treeFolder(key)) return false;
    const added = await TemplatePreferences.createFolderState(key, false);
    if (added) ActionHistory.add(folderAction(key, false, true));
    return added;
  }

  // Supprime le dossier `path` s'il est vide : sa ligne d'état est retirée. Rend `false` sans rien écrire quand il n'est pas dans la liste ou qu'un modèle ou un sous-dossier l'occupe ; un pas à défaire sinon.
  // Lève si Grist refuse l'écriture : le dossier reste alors là.
  async function deleteFolder(path) {
    const key = asPath(path);
    const node = key && treeFolder(key);
    if (!node || node.enfants.length) return false;
    const collapsed = TemplatePreferences.isFolderCollapsed(key);
    const removed = await TemplatePreferences.clearFolderState(key);
    if (removed) ActionHistory.add(folderAction(key, collapsed, false));
    return removed;
  }

  // Relit le rangement dans la table - GFS y écrit aussi (consigne 072), et ce widget l'a chargé une fois au démarrage - et redessine la liste des modèles et la
  // fenêtre « Organiser » quand il a changé. Appelée à chaque ouverture de l'une et de l'autre, aucun geste de la personne ne l'attend ; une lecture qui échoue
  // laisse l'écran tel qu'il est. Rend la promesse, pour que les essais attendent la fin.
  async function reread() {
    try {
      if (await TemplatePreferences.refresh()) redraw();
    } catch (e) {
      console.error('[template-arrangement] relecture du rangement impossible', e);
    }
  }

  return { pin, moveTo, foldByDefault, createFolder, deleteFolder, reread };
})();
