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
  let modal, searchInput, list, newFolderBtn;
  let searchTerm = '';
  let pendingFolder = null;
  let pendingCollapsed = false; // interrupteur du dossier en attente, écrit seulement quand il devient réel (cf. applyPendingFolderState)

  // Après toute écriture (épingle, dossier), l'arbre de la barre d'outils se met à jour sans fermeture ni réouverture (TemplateTreeSelect.refresh(),
  // aussi appelé au chargement asynchrone des préférences).
  function refreshTree() { TemplateTreeSelect.refresh(); }

  function findFolderInTree(nodes, path) {
    for (const n of nodes) {
      if (n.type !== 'dossier') continue;
      if (n.chemin === path) return n;
      const found = findFolderInTree(n.enfants, path);
      if (found) return found;
    }
    return null;
  }

  // Nom du seul nouveau segment : le préfixe du parent est géré ici (voir pendingFolder).
  async function promptNewFolderName(parentPath) {
    const value = await Dialogs.prompt({ title: I18n.t('dialog.newFolder.title'), label: I18n.t('organize.modal.newFolderPrompt'), confirmLabel: I18n.t('common.create') });
    if (value === null) return null;
    const full = parentPath ? parentPath + '/' + value : value;
    return TemplatePreferences.normalizeFolderPath(full);
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
      render();
      refreshTree();
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
      render();
      refreshTree();
    } catch (e) {
      console.error('[template-organize-modal] échec du déplacement', e);
    }
  }

  async function togglePin(id, pinned) {
    try {
      // setPinned() ne lève pas pour une identification indisponible (repli anonyme, js/template-preferences.js).
      await TemplatePreferences.setPinned(id, !pinned);
      render();
      refreshTree();
    } catch (e) {
      console.error('[template-organize-modal] échec épinglage', e);
    }
  }

  // Bascule « déplié / replié » d'un dossier réel. Le nouvel état est lu au clic (deux clics rapides doivent revenir à l'état de départ) et
  // l'interface suit tout de suite ; si Grist refuse l'écriture, retour au dernier état confirmé et redessin.
  async function toggleFolderDefault(path) {
    const pending = TemplatePreferences.setFolderCollapsed(path, !TemplatePreferences.isFolderCollapsed(path));
    render();
    refreshTree();
    try {
      await pending;
    } catch (e) {
      console.error('[template-organize-modal] échec de l’état du dossier', e);
      render();
      refreshTree();
    }
  }

  // Interrupteur d'une ligne dossier (réelle ou en attente). Deux tracés distincts (déplié : le contenu sous l'en-tête ; replié : l'en-tête seul et
  // trois points), ni la punaise, ni l'étoile, ni un chevron (une icône = une fonction). L'info-bulle dit l'état courant et ce que fait le clic.
  function makeFolderDefaultButton(collapsed, focusKey, onToggle) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tom-folder-default-btn';
    btn.dataset.focusKey = focusKey; // cf. render() : le bouton retrouve le focus après le redessin
    btn.classList.toggle('is-collapsed', collapsed);
    btn.setAttribute('aria-pressed', String(collapsed));
    btn.setAttribute('aria-label', I18n.t('organize.modal.folderDefault.aria'));
    btn.title = I18n.t(collapsed ? 'organize.modal.folderDefault.collapsedTip' : 'organize.modal.folderDefault.expandedTip');
    btn.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
    return btn;
  }

  // folderLabel : seulement pour les lignes épinglées (à plat en tête, donc sans indentation qui indique leur dossier).
  function makeLeafRow(node, depth, folderLabel) {
    const row = document.createElement('div');
    row.className = 'tts-row tts-row-leaf';
    row.style.setProperty('--tts-depth', String(depth));
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

    row.appendChild(TemplateTreeSelect.iconSpan(node.typeModele));
    const label = document.createElement('span');
    label.className = 'tts-row-label';
    label.textContent = node.nom;
    row.appendChild(label);
    if (folderLabel) {
      const hint = document.createElement('span');
      hint.className = 'tom-folder-hint';
      hint.textContent = folderLabel;
      row.appendChild(hint);
    }

    const prefs = TemplatePreferences.getCached();
    const pref = prefs[node.id];
    const pinned = !!(pref && pref.epingle);
    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'tts-pin-btn';
    pinBtn.classList.toggle('is-pinned', pinned);
    pinBtn.setAttribute('aria-pressed', String(pinned));
    pinBtn.setAttribute('aria-label', I18n.t('templateTree.pin.aria'));
    // Info-bulle native (la fenêtre vit hors de #toolbar-top : le [data-tip] de la barre ne s'y applique pas) : dit ce que fait le clic dans l'état
    // courant, pour ne pas le confondre avec l'étoile « modèle par défaut » de la barre.
    pinBtn.title = I18n.t(pinned ? 'templateTree.unpin.tip' : 'templateTree.pin.tip');
    pinBtn.addEventListener('click', () => togglePin(node.id, pinned));
    row.appendChild(pinBtn);

    const moveBtn = document.createElement('button');
    moveBtn.type = 'button';
    moveBtn.className = 'tom-move-btn';
    moveBtn.textContent = I18n.t('organize.modal.moveButton');
    moveBtn.addEventListener('click', () => moveTemplate(node.id, (pref && pref.dossier) || ''));
    row.appendChild(moveBtn);

    // Repli sans souris ni tactile tant qu'un dossier « en attente » existe (le glisser-déposer n'a pas d'équivalent clavier) : un bouton sur chaque
    // modèle.
    if (pendingFolder) {
      const placeBtn = document.createElement('button');
      placeBtn.type = 'button';
      placeBtn.className = 'tom-place-here-btn';
      placeBtn.textContent = I18n.t('organize.modal.placeHereButton');
      placeBtn.addEventListener('click', (e) => { e.stopPropagation(); dropOnFolder(node.id, pendingFolder); });
      row.appendChild(placeBtn);
    }

    return row;
  }

  function makeFolderRow(node, depth) {
    const row = document.createElement('div');
    row.className = 'tts-row tts-row-folder';
    row.setAttribute('aria-expanded', 'true');
    row.style.setProperty('--tts-depth', String(depth));
    row.appendChild(Object.assign(document.createElement('span'), { className: 'tts-folder-caret' }));
    row.appendChild(TemplateTreeSelect.iconSpan('folder'));
    const label = document.createElement('span');
    label.className = 'tts-row-label';
    label.textContent = node.nom;
    row.appendChild(label);

    const addSubBtn = document.createElement('button');
    addSubBtn.type = 'button';
    addSubBtn.className = 'tom-add-subfolder-btn';
    addSubBtn.setAttribute('aria-label', I18n.t('organize.modal.newSubfolderAria'));
    addSubBtn.textContent = '+';
    addSubBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const path = await promptNewFolderName(node.chemin);
      if (!path) return;
      pendingFolder = path;
      pendingCollapsed = false;
      render();
      revealPendingFolder();
    });
    row.appendChild(addSubBtn);
    row.appendChild(makeFolderDefaultButton(TemplatePreferences.isFolderCollapsed(node.chemin), 'folder-default:' + node.chemin, () => toggleFolderDefault(node.chemin)));

    const group = document.createElement('div');
    group.className = 'tts-group';
    // Profondeur du dossier (pas celle de ses enfants) : css/template-tree-select.css cale le trait guide du groupe sur le caret de CE dossier ;
    // posée explicitement, sinon le groupe hériterait de celle du groupe parent.
    group.style.setProperty('--tts-depth', String(depth));
    node.enfants.forEach((child) => group.appendChild(makeNode(child, depth + 1)));

    row.addEventListener('click', () => {
      const expanded = row.getAttribute('aria-expanded') !== 'false';
      row.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      group.classList.toggle('is-collapsed', expanded);
    });

    // Cible de glisser-déposer : preventDefault() sur dragover est obligatoire (règle HTML5 DnD), sinon 'drop' ne se déclenche jamais.
    row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('tom-drop-target'); });
    row.addEventListener('dragleave', () => row.classList.remove('tom-drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('tom-drop-target');
      const id = e.dataTransfer.getData('text/plain');
      if (id) dropOnFolder(id, node.chemin);
    });

    // Fragment plutôt qu'un <div> englobant (comme js/template-tree-select.js:makeFolderRow) : `group` doit rester le frère direct de `row` pour un
    // dossier imbriqué.
    const fragment = document.createDocumentFragment();
    fragment.appendChild(row);
    fragment.appendChild(group);
    return fragment;
  }

  function makeNode(node, depth) {
    return node.type === 'dossier' ? makeFolderRow(node, depth) : makeLeafRow(node, depth, null);
  }

  // Dossier « en attente » : affiché à part, à plat, avec son chemin complet, car il n'a pas encore de place stable dans l'arbre ; il disparaît dès
  // que le premier modèle y est rangé (view.tree le contient alors).
  function makePendingFolderRow(path) {
    const row = document.createElement('div');
    row.className = 'tts-row tts-row-folder tom-pending-folder';
    row.style.setProperty('--tts-depth', '0');
    row.appendChild(Object.assign(document.createElement('span'), { className: 'tts-folder-caret' }));
    row.appendChild(TemplateTreeSelect.iconSpan('folder'));
    const label = document.createElement('span');
    label.className = 'tts-row-label';
    label.textContent = path;
    row.appendChild(label);
    const hint = document.createElement('span');
    hint.className = 'tom-pending-hint';
    hint.textContent = I18n.t('organize.modal.newFolderPendingHint');
    row.appendChild(hint);
    row.appendChild(makeFolderDefaultButton(pendingCollapsed, 'folder-default:pending', () => { pendingCollapsed = !pendingCollapsed; render(); }));
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'tom-cancel-pending-btn';
    cancelBtn.setAttribute('aria-label', I18n.t('organize.modal.newFolderCancelAria'));
    cancelBtn.textContent = '×';
    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); pendingFolder = null; pendingCollapsed = false; render(); });
    row.appendChild(cancelBtn);

    row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('tom-drop-target'); });
    row.addEventListener('dragleave', () => row.classList.remove('tom-drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('tom-drop-target');
      const id = e.dataTransfer.getData('text/plain');
      if (id) dropOnFolder(id, path);
    });
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
      const empty = document.createElement('div');
      empty.className = 'tom-empty';
      empty.textContent = I18n.t('organize.modal.noMatch');
      list.appendChild(empty);
      return;
    }

    const view = TemplateOrganizer.buildView(templates, TemplatePreferences.getCached());

    // Le dossier en attente est devenu réel (un modèle y a été rangé) : il apparaît à sa vraie place dans view.tree.
    if (pendingFolder && findFolderInTree(view.tree, pendingFolder)) pendingFolder = null;

    if (view.pinned.length) {
      const sep = document.createElement('div');
      sep.className = 'tts-section-label';
      sep.textContent = I18n.t('templateTree.pinnedSection');
      list.appendChild(sep);
      view.pinned.forEach((p) => list.appendChild(makeLeafRow(p, 0, p.dossier)));
    }
    if (view.tree.length) {
      const sep = document.createElement('div');
      sep.className = 'tts-section-label';
      sep.textContent = I18n.t('templateTree.allSection');
      list.appendChild(sep);
      view.tree.forEach((n) => list.appendChild(makeNode(n, 0)));
    }
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
    pendingFolder = null;
    pendingCollapsed = false;
    if (searchInput) searchInput.value = '';
    render();
    if (searchInput) searchInput.focus();
  }

  function close() {
    if (modal) modal.style.display = 'none';
    // Un dossier resté « en attente » n'a rien écrit dans Grist : fermer la fenêtre l'abandonne, comme annuler la saisie « Déplacer vers… ».
    pendingFolder = null;
    pendingCollapsed = false;
  }

  async function onNewRootFolder() {
    const path = await promptNewFolderName('');
    if (!path) return;
    pendingFolder = path;
    pendingCollapsed = false;
    render();
    revealPendingFolder();
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
    newFolderBtn.addEventListener('click', onNewRootFolder);
    searchInput.addEventListener('input', () => { searchTerm = searchInput.value || ''; render(); });
  }

  return { wire, open, close };
})();
