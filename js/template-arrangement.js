// Le rangement des modèles de la personne (js/template-preferences.js) dans l'historique d'Annuler / Rétablir : l'épingle d'un modèle, le dossier où il est rangé, l'état « replié par défaut » d'un dossier. Les deux écrans qui le
// changent - la liste des modèles (js/template-tree-select.js) et la fenêtre « Organiser mes modèles » (js/template-organize-modal.js) - passent par ici au lieu d'écrire dans les préférences : le geste est écrit, puis posé dans la
// pile de js/action-history.js, d'où Ctrl + Z, Ctrl + Y, Ctrl + Maj + Z et les boutons de la barre le défont depuis n'importe quel modèle (le rangement vise la bibliothèque, pas le modèle ouvert, comme le ★ du document).
//
// Défaire rend l'état d'AVANT le geste, rétablir celui d'APRÈS, tels quels : le rangement est personnel, personne d'autre ne l'a changé. Un modèle supprimé entre-temps n'est pas rangé de nouveau : rien n'est écrit et le coin
// d'état le dit. Un geste qui ne change rien (épingler un modèle déjà épinglé, le ranger où il est) s'écrit comme avant mais ne laisse pas de pas à défaire. Un échec d'écriture n'en laisse pas non plus.
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

  function foldAction(path, from, to) {
    async function put(target) {
      await TemplatePreferences.setFolderCollapsed(path, target);
      redraw();
      return I18n.t(target ? 'status.folderCollapsed' : 'status.folderExpanded', { folder: path });
    }
    return { undo: () => put(from), redo: () => put(to) };
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
    await TemplatePreferences.setFolderCollapsed(key, collapsed);
    if (key && before !== !!collapsed) ActionHistory.add(foldAction(key, before, !!collapsed));
  }

  return { pin, moveTo, foldByDefault };
})();
