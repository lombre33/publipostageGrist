// « Organiser mes modèles » (planning/feature-rangement-tri-modeles.md §4/§8.3) : fenêtre pour créer des dossiers et y ranger des modèles. Réutilise
// TemplateOrganizer.buildView et TemplatePreferences tels quels.
// Un dossier n'existe que comme valeur du champ Dossier d'au moins une préférence (pas de table de dossiers). Un « + » ne persiste donc jamais un
// dossier vide : il nomme un chemin « en attente » (pendingFolder, état local, jamais écrit) affiché comme une ligne à part jusqu'à ce qu'un modèle y
// soit rangé, par glisser-déposer ou par « Ranger ici » (le glisser-déposer n'a pas d'équivalent clavier ni tactile fiable). Dès cette première
// écriture, buildView fait apparaître le vrai dossier et la ligne en attente disparaît au render() suivant. « Déplacer vers… » (chemin tapé) reste
// utilisable partout, y compris pour créer un dossier.
// Dossier déplié ou replié par défaut dans la liste déroulante : chaque ligne dossier porte un interrupteur (.tom-folder-default-btn), enregistré par
// personne (TemplatePreferences.setFolderCollapsed) et lu par js/template-tree-select.js à chaque ouverture. Cette fenêtre garde ses dossiers dépliés
// (il faut tout voir pour ranger) : l'interrupteur ne règle que la liste déroulante. Celui d'un dossier en attente reste local (pendingCollapsed)
// jusqu'au premier modèle rangé.
const TemplateOrganizeModal = (function () {
  const { el, button } = Dom;
  let modal, searchInput, list, newFolderBtn;
  let searchTerm = '';
  let pendingFolder = null;
  let pendingCollapsed = false; // interrupteur du dossier en attente, écrit seulement quand il devient réel (cf. applyPendingFolderState)

  // Après toute écriture (épingle, dossier), la liste et l'arbre de la barre d'outils se mettent à jour sans fermeture ni réouverture
  // (TemplateTreeSelect.refresh() est aussi appelé au chargement asynchrone des préférences).
  function redraw() {
    render();
    TemplateTreeSelect.refresh();
  }

  function findFolderInTree(nodes, path) {
    for (const n of nodes) {
      if (n.type !== 'dossier') continue;
      if (n.chemin === path) return n;
      const found = findFolderInTree(n.enfants, path);
      if (found) return found;
    }
    return null;
  }

  // Le dossier en attente (null : aucun) repart toujours déplié.
  function setPendingFolder(path) {
    pendingFolder = path;
    pendingCollapsed = false;
  }

  // « + » : demande le nom du seul nouveau segment (le préfixe du parent est géré ici, voir pendingFolder), puis pose le dossier en attente.
  async function addFolder(parentPath) {
    const value = await Dialogs.prompt({ title: I18n.t('dialog.newFolder.title'), label: I18n.t('organize.modal.newFolderPrompt'), confirmLabel: I18n.t('common.create') });
    if (value === null) return;
    const path = TemplatePreferences.normalizeFolderPath(parentPath ? parentPath + '/' + value : value);
    if (!path) return;
    setPendingFolder(path);
    render();
    revealPendingFolder();
  }

  // Le dossier en attente vient d'être créé par un rangement : son interrupteur « replié par défaut », resté local, est écrit maintenant. Un échec ne
  // défait pas le rangement (le dossier existe, déplié) : il est seulement journalisé.
  async function applyPendingFolderState(path) {
    if (!path || pendingFolder !== path || !pendingCollapsed) return;
    pendingCollapsed = false;
    try {
      await TemplatePreferences.setFolderCollapsed(path, true);
    } catch (e) {
      console.error('[template-organize-modal] échec de l’état replié du nouveau dossier', e);
    }
  }

  async function dropOnFolder(id, path) {
    try {
      await TemplatePreferences.setFolder(id, path);
      await applyPendingFolderState(path);
      if (pendingFolder === path) pendingFolder = null;
      redraw();
    } catch (e) {
      console.error('[template-organize-modal] échec du glisser-déposer', e);
    }
  }

  async function moveTemplate(id, currentFolder) {
    const folders = TemplatePreferences.listFolders();
    const hint = folders.length
      ? I18n.t('organize.modal.moveHint', { folders: folders.join(', ') })
      : I18n.t('organize.modal.moveHintEmpty');
    const value = await Dialogs.prompt({ title: I18n.t('dialog.moveFolder.title'), message: hint, value: currentFolder || '', confirmLabel: I18n.t('common.move') });
    if (value === null) return;  // Annulé : rien à écrire (une chaîne vide, elle, vide le dossier).
    try {
      await TemplatePreferences.setFolder(id, value);
      await applyPendingFolderState(TemplatePreferences.normalizeFolderPath(value));
      redraw();
    } catch (e) {
      console.error('[template-organize-modal] échec du déplacement', e);
    }
  }

  async function togglePin(id, pinned) {
    try {
      // setPinned() ne lève pas pour une identification indisponible (repli anonyme, js/template-preferences.js).
      await TemplatePreferences.setPinned(id, !pinned);
      redraw();
    } catch (e) {
      console.error('[template-organize-modal] échec épinglage', e);
    }
  }

  // Bascule « déplié / replié » d'un dossier réel. Le nouvel état est lu au clic (deux clics rapides doivent revenir à l'état de départ) et
  // l'interface suit tout de suite ; si Grist refuse l'écriture, retour au dernier état confirmé et redessin.
  async function toggleFolderDefault(path) {
    const pending = TemplatePreferences.setFolderCollapsed(path, !TemplatePreferences.isFolderCollapsed(path));
    redraw();
    try {
      await pending;
    } catch (e) {
      console.error('[template-organize-modal] échec de l’état du dossier', e);
      redraw();
    }
  }

  // Interrupteur d'une ligne dossier (réelle ou en attente). Deux tracés distincts (déplié : le contenu sous l'en-tête ; replié : l'en-tête seul et
  // trois points), ni la punaise, ni l'étoile, ni un chevron (une icône = une fonction). L'info-bulle dit l'état courant et ce que fait le clic.
  function makeFolderDefaultButton(collapsed, focusKey, onToggle) {
    const btn = button('tom-folder-default-btn');
    btn.dataset.focusKey = focusKey; // cf. render() : le bouton retrouve le focus après le redessin
    btn.classList.toggle('is-collapsed', collapsed);
    btn.setAttribute('aria-pressed', String(collapsed));
    btn.setAttribute('aria-label', I18n.t('organize.modal.folderDefault.aria'));
    btn.title = I18n.t(collapsed ? 'organize.modal.folderDefault.collapsedTip' : 'organize.modal.folderDefault.expandedTip');
    btn.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
    return btn;
  }

  // Cible de glisser-déposer pour le dossier `path` : preventDefault() sur dragover est obligatoire (règle HTML5 DnD), sinon 'drop' ne se déclenche
  // jamais.
  function acceptDrops(row, path) {
    row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('tom-drop-target'); });
    row.addEventListener('dragleave', () => row.classList.remove('tom-drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('tom-drop-target');
      const id = e.dataTransfer.getData('text/plain');
      if (id) dropOnFolder(id, path);
    });
  }

  // folderLabel : seulement pour les lignes épinglées (à plat en tête, donc sans indentation qui indique leur dossier).
  function makeLeafRow(node, depth, folderLabel) {
    const row = TemplateTreeSelect.rowShell('leaf', depth, node.typeModele, node.nom);
    row.dataset.templateId = String(node.id);

    // Glisser-déposer : seules les feuilles sont draggable (un dossier n'a pas d'identité propre à déplacer). dragend se déclenche toujours (drop
    // réussi, annulé ou hors cible) : sans lui une ligne resterait « figée » en cours de glissement.
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(node.id));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('tom-dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('tom-dragging'));

    if (folderLabel) row.appendChild(el('span', 'tom-folder-hint', folderLabel));

    const pinned = TemplatePreferences.isPinned(node.id);
    const pinBtn = TemplateTreeSelect.pinButton(pinned);
    pinBtn.addEventListener('click', () => togglePin(node.id, pinned));
    const moveBtn = button('tom-move-btn', I18n.t('organize.modal.moveButton'));
    moveBtn.addEventListener('click', () => moveTemplate(node.id, TemplatePreferences.getFolder(node.id) || ''));
    row.append(pinBtn, moveBtn);

    // Repli sans souris ni tactile tant qu'un dossier « en attente » existe (le glisser-déposer n'a pas d'équivalent clavier) : un bouton sur chaque
    // modèle.
    if (pendingFolder) {
      const placeBtn = button('tom-place-here-btn', I18n.t('organize.modal.placeHereButton'));
      placeBtn.addEventListener('click', (e) => { e.stopPropagation(); dropOnFolder(node.id, pendingFolder); });
      row.appendChild(placeBtn);
    }

    return row;
  }

  function makeFolderRow(node, depth) {
    const row = TemplateTreeSelect.rowShell('folder', depth, null, node.nom);
    row.setAttribute('aria-expanded', 'true');
    const addSubBtn = button('tom-add-subfolder-btn', '+');
    addSubBtn.setAttribute('aria-label', I18n.t('organize.modal.newSubfolderAria'));
    addSubBtn.addEventListener('click', (e) => { e.stopPropagation(); addFolder(node.chemin); });
    row.append(addSubBtn, makeFolderDefaultButton(TemplatePreferences.isFolderCollapsed(node.chemin), 'folder-default:' + node.chemin, () => toggleFolderDefault(node.chemin)));

    const group = TemplateTreeSelect.makeGroup(depth, node.enfants, makeNode);
    row.addEventListener('click', () => {
      const expanded = row.getAttribute('aria-expanded') !== 'false';
      row.setAttribute('aria-expanded', String(!expanded));
      group.classList.toggle('is-collapsed', expanded);
    });
    acceptDrops(row, node.chemin);

    // Fragment plutôt qu'un <div> englobant (comme js/template-tree-select.js:makeFolderRow) : `group` doit rester le frère direct de `row` pour un
    // dossier imbriqué.
    const fragment = document.createDocumentFragment();
    fragment.append(row, group);
    return fragment;
  }

  function makeNode(node, depth) {
    return node.type === 'dossier' ? makeFolderRow(node, depth) : makeLeafRow(node, depth, null);
  }

  // Dossier « en attente » : affiché à part, à plat, avec son chemin complet, car il n'a pas encore de place stable dans l'arbre ; il disparaît dès
  // que le premier modèle y est rangé (view.tree le contient alors).
  function makePendingFolderRow(path) {
    const row = TemplateTreeSelect.rowShell('folder', 0, null, path);
    row.classList.add('tom-pending-folder');
    const cancelBtn = button('tom-cancel-pending-btn', '×');
    cancelBtn.setAttribute('aria-label', I18n.t('organize.modal.newFolderCancelAria'));
    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); setPendingFolder(null); render(); });
    row.append(
      el('span', 'tom-pending-hint', I18n.t('organize.modal.newFolderPendingHint')),
      makeFolderDefaultButton(pendingCollapsed, 'folder-default:pending', () => { pendingCollapsed = !pendingCollapsed; render(); }),
      cancelBtn,
    );
    acceptDrops(row, path);
    return row;
  }

  // Redessine la liste en gardant le focus et le défilement. list.innerHTML = '' détruit le bouton cliqué : le focus retomberait sur <body> et le
  // clavier repartirait du début de la fenêtre. Le bouton est retrouvé par data-focus-key ; à défaut (il a disparu avec le redessin, ex. « Ranger ici
  // »), le focus va à la liste (tabindex -1, hors piège de Tab).
  function render() {
    const active = document.activeElement;
    const focusInList = !!(active && list.contains(active));
    const focusKey = focusInList ? (active.dataset.focusKey || null) : null;
    const scrollTop = list.scrollTop;
    renderList();
    list.scrollTop = scrollTop;
    if (!focusInList) return;
    const again = focusKey && list.querySelector('[data-focus-key="' + CSS.escape(focusKey) + '"]');
    (again || list).focus({ preventScroll: true });
  }

  function renderList() {
    list.innerHTML = '';
    const term = searchTerm.trim().toLowerCase();
    const templates = Templates.getCached().filter((t) => !term || String(t.nom ?? '').toLowerCase().includes(term));

    if (!templates.length) {
      list.appendChild(el('div', 'tom-empty', I18n.t('organize.modal.noMatch')));
      return;
    }

    const view = TemplateOrganizer.buildView(templates, TemplatePreferences.getCached());

    // Le dossier en attente est devenu réel (un modèle y a été rangé) : il apparaît à sa vraie place dans view.tree.
    if (pendingFolder && findFolderInTree(view.tree, pendingFolder)) pendingFolder = null;

    TemplateTreeSelect.appendSections(list, view, (p) => makeLeafRow(p, 0, p.dossier), (n) => makeNode(n, 0));
    if (pendingFolder) list.appendChild(makePendingFolderRow(pendingFolder));
  }

  // Le dossier « en attente » est la dernière ligne : dans une fenêtre basse la liste défile, donc on la ramène en vue pour montrer qu'il a été créé
  // (et son interrupteur).
  function revealPendingFolder() {
    if (list.querySelector('.tom-pending-folder')) list.scrollTop = list.scrollHeight;
  }

  function open() {
    if (!modal) return;
    modal.style.display = 'flex';
    searchTerm = '';
    setPendingFolder(null);
    if (searchInput) searchInput.value = '';
    render();
    if (searchInput) searchInput.focus();
  }

  function close() {
    if (modal) modal.style.display = 'none';
    // Un dossier resté « en attente » n'a rien écrit dans Grist : fermer la fenêtre l'abandonne, comme annuler la saisie « Déplacer vers… ».
    setPendingFolder(null);
  }

  // Branché une seule fois à l'init (js/main.js), comme MacroEditor.wire(). ModalBase.adopt (js/main.js:wirePageModals) gère Échap, le piège de focus
  // et sa restauration.
  function wire() {
    modal = document.getElementById('template-organize-modal');
    searchInput = document.getElementById('template-organize-search');
    list = document.getElementById('template-organize-list');
    newFolderBtn = document.getElementById('template-organize-new-folder');
    const closeBtn = document.getElementById('template-organize-close');
    if (!modal || !searchInput || !list || !newFolderBtn || !closeBtn) return;
    list.tabIndex = -1; // focusable par programme seulement (cf. render), jamais dans l'ordre de Tab
    closeBtn.addEventListener('click', close);
    newFolderBtn.addEventListener('click', () => addFolder(''));
    searchInput.addEventListener('input', () => { searchTerm = searchInput.value || ''; render(); });
  }

  return { wire, open, close };
})();
