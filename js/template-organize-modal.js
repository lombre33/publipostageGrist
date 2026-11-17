// « Organiser mes modèles » (planning/feature-rangement-tri-modeles.md §4/§8.3) : fenêtre pour créer des dossiers et y ranger des modèles. Réutilise
// TemplateOrganizer.buildView et TemplatePreferences tels quels.
// Un dossier existe tant qu'une ligne le nomme (pas de table de dossiers) : le champ Dossier de la préférence d'un modèle, ou une ligne d'état sans modèle
// (ModeleId = 0, js/template-preferences.js : celle que GFS écrit pour un dossier créé vide, listStateFolders ; buildView la montre comme un dossier vide). « + Nouveau
// dossier » et le « + » d'une ligne dossier écrivent cette même ligne (TemplateArrangement.createFolder) : le dossier vide est gardé, GFS le voit aussi, et un dossier vide porte un
// bouton « Supprimer » (TemplateArrangement.deleteFolder) qui retire la ligne ; l'un et l'autre se défont et se rétablissent (Ctrl + Z, Ctrl + Y). Le dossier tout juste créé et resté vide est
// celui que « Ranger ici » vise (placeTarget, état local, jamais écrit) : un bouton sur chaque modèle, repli du glisser-déposer qui n'a pas d'équivalent clavier ni tactile fiable ;
// il s'efface dès qu'un modèle y est rangé. « Déplacer vers… » (chemin tapé) reste utilisable partout, y compris pour créer un dossier.
// Dossier déplié ou replié par défaut dans la liste déroulante : chaque ligne dossier porte un interrupteur (.tom-folder-default-btn), enregistré par
// personne (TemplatePreferences.setFolderCollapsed) et lu par js/template-tree-select.js à chaque ouverture. Cette fenêtre garde ses dossiers dépliés
// (il faut tout voir pour ranger) : l'interrupteur ne règle que la liste déroulante.
// Chaque ligne de modèle porte aussi l'étoile du modèle par défaut du document (TemplateTreeSelect.defaultMarks, la même brique que la liste déroulante) :
// ce réglage-là n'est pas personnel, c'est celui de tout le document, et la légende au bas de la fenêtre le dit à côté du rangement personnel.
// Les gestes de rangement (épingle, dossier, dossier replié par défaut, dossier vide créé ou supprimé) s'écrivent par js/template-arrangement.js, qui les pose aussi dans l'historique d'Annuler / Rétablir.
const TemplateOrganizeModal = (function () {
  const { el, button } = Dom;
  let modal, searchInput, list, newFolderBtn;
  let searchTerm = '';
  let placeTarget = null; // le dossier vide tout juste créé : « Ranger ici » y range un modèle (null : aucun) ; local, jamais écrit

  // Après toute écriture (épingle, dossier), la liste et l'arbre de la barre d'outils se mettent à jour sans fermeture ni réouverture
  // (TemplateTreeSelect.refresh() est aussi appelé au chargement asynchrone des préférences).
  function redraw() {
    render();
    TemplateTreeSelect.refresh();
  }

  // L'arbre entier, sans le filtre de la recherche : ce que les dossiers contiennent vraiment (un dossier est vide ou non, quoi que la recherche en montre).
  function fullTree() {
    return TemplateOrganizer.buildView(Templates.getCached(), TemplatePreferences.getCached(), TemplatePreferences.listStateFolders()).tree;
  }

  // Le dossier à remplir ne l'est plus quand un modèle y est rangé (par n'importe quel geste) ou qu'il a disparu (supprimé, défait).
  function syncPlaceTarget() {
    if (!placeTarget) return;
    const node = TemplateOrganizer.findFolder(fullTree(), placeTarget);
    if (!node || node.enfants.some((child) => child.type === 'modele')) placeTarget = null;
  }

  // Ramène la ligne du dossier `path` dans la fenêtre de la liste (elle défile : le dossier tout juste créé se classe à sa place alphabétique, peut-être hors de vue).
  function revealFolder(path) {
    const row = list.querySelector('[data-folder-path="' + CSS.escape(path) + '"]');
    if (!row) return;
    const r = row.getBoundingClientRect(), l = list.getBoundingClientRect();
    if (r.top < l.top) list.scrollTop += r.top - l.top;
    else if (r.bottom > l.bottom) list.scrollTop += r.bottom - l.bottom;
  }

  // « + » : demande le nom du seul nouveau segment (le préfixe du parent est géré ici), puis écrit le dossier vide (TemplateArrangement.createFolder : sa ligne d'état, un pas à
  // défaire). Un dossier que la liste montre déjà n'est pas réécrit. Le dossier reste là, vide, jusqu'à ce que la personne le remplisse ou le supprime ; il devient la cible de « Ranger ici ».
  async function addFolder(parentPath) {
    const value = await Dialogs.prompt({ title: I18n.t('dialog.newFolder.title'), label: I18n.t('organize.modal.newFolderPrompt'), confirmLabel: I18n.t('common.create') });
    if (value === null) return;
    const path = TemplatePreferences.normalizeFolderPath(parentPath ? parentPath + '/' + value : value);
    if (!path) return;
    try {
      await TemplateArrangement.createFolder(path);
    } catch (e) {
      console.error('[template-organize-modal] échec de la création du dossier', e);
      return;
    }
    const node = TemplateOrganizer.findFolder(fullTree(), path);
    placeTarget = node && !node.enfants.length ? path : null;
    redraw();
    revealFolder(path);
  }

  // « Supprimer » sur un dossier vide : sa ligne d'état est retirée (un pas à défaire). Si Grist refuse, le dossier reste et la liste est redessinée telle qu'elle est.
  async function removeFolder(path) {
    try {
      await TemplateArrangement.deleteFolder(path);
    } catch (e) {
      console.error('[template-organize-modal] échec de la suppression du dossier', e);
    }
    redraw();
  }

  async function dropOnFolder(id, path) {
    try {
      await TemplateArrangement.moveTo(id, path);
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
      await TemplateArrangement.moveTo(id, value);
      redraw();
    } catch (e) {
      console.error('[template-organize-modal] échec du déplacement', e);
    }
  }

  async function togglePin(id, pinned) {
    try {
      // setPinned() ne lève pas pour une identification indisponible (repli anonyme, js/template-preferences.js).
      await TemplateArrangement.pin(id, !pinned);
      redraw();
    } catch (e) {
      console.error('[template-organize-modal] échec épinglage', e);
    }
  }

  // Bascule « déplié / replié » d'un dossier. Le nouvel état est lu au clic (deux clics rapides doivent revenir à l'état de départ) et
  // l'interface suit tout de suite ; si Grist refuse l'écriture, retour au dernier état confirmé et redessin.
  async function toggleFolderDefault(path) {
    const pending = TemplateArrangement.foldByDefault(path, !TemplatePreferences.isFolderCollapsed(path));
    redraw();
    try {
      await pending;
    } catch (e) {
      console.error('[template-organize-modal] échec de l’état du dossier', e);
      redraw();
    }
  }

  // Interrupteur d'une ligne dossier. Deux tracés distincts (déplié : le contenu sous l'en-tête ; replié : l'en-tête seul et
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

  // folderLabel : seulement pour les lignes épinglées (à plat en tête, donc sans indentation qui indique leur dossier). inPinned : la ligne est dans la section « Épinglés ».
  function makeLeafRow(node, depth, folderLabel, inPinned) {
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
    // L'étoile du modèle par défaut est, elle, commune à toutes les personnes du document : la légende du bas de la fenêtre le dit. Posée par la même brique
    // que celle de la liste déroulante ; la liste de cette fenêtre se redessine une fois le ★ écrit (celle de la barre le fait seule).
    row.append(...TemplateTreeSelect.defaultMarks(node, { afterToggle: redraw, focusScope: inPinned ? 'pinned' : 'all' }), pinBtn, moveBtn);

    // Repli sans souris ni tactile tant qu'un dossier tout juste créé est vide (le glisser-déposer n'a pas d'équivalent clavier) : un bouton sur chaque
    // modèle.
    if (placeTarget) {
      const target = placeTarget;
      const placeBtn = button('tom-place-here-btn', I18n.t('organize.modal.placeHereButton'));
      placeBtn.addEventListener('click', (e) => { e.stopPropagation(); dropOnFolder(node.id, target); });
      row.appendChild(placeBtn);
    }

    return row;
  }

  function makeFolderRow(node, depth) {
    const row = TemplateTreeSelect.rowShell('folder', depth, null, node.nom);
    row.setAttribute('aria-expanded', 'true');
    row.dataset.folderPath = node.chemin;
    if (node.chemin === placeTarget) {
      row.classList.add('tom-row-has-hint'); // le nom garde sa place, c'est l'invite qui se raccourcit (css/template-organize-modal.css)
      row.appendChild(el('span', 'tom-place-hint', I18n.t('organize.modal.newFolderHint')));
    }
    const addSubBtn = button('tom-add-subfolder-btn', '+');
    addSubBtn.setAttribute('aria-label', I18n.t('organize.modal.newSubfolderAria'));
    addSubBtn.addEventListener('click', (e) => { e.stopPropagation(); addFolder(node.chemin); });
    row.appendChild(addSubBtn);
    // Un dossier sans modèle ni sous-dossier se supprime : sa ligne d'état est la seule chose qui le fait exister.
    if (!node.enfants.length) {
      const deleteBtn = button('tom-folder-delete-btn', I18n.t('organize.modal.deleteFolder'));
      deleteBtn.dataset.focusKey = 'folder-delete:' + node.chemin;
      deleteBtn.setAttribute('aria-label', I18n.t('organize.modal.deleteFolderAria', { folder: node.chemin }));
      deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); removeFolder(node.chemin); });
      row.appendChild(deleteBtn);
    }
    row.appendChild(makeFolderDefaultButton(TemplatePreferences.isFolderCollapsed(node.chemin), 'folder-default:' + node.chemin, () => toggleFolderDefault(node.chemin)));

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
    syncPlaceTarget();
    const matchesName = SearchSelect.nameMatcher(searchTerm);
    const templates = Templates.getCached().filter((t) => matchesName(String(t.nom ?? '')));
    // Les dossiers qui n'ont que leur ligne d'état (créés vides dans GFS) se montrent sans recherche en cours : une recherche ne garde que les modèles qui
    // correspondent, et les dossiers qui les portent.
    const folders = searchTerm ? [] : TemplatePreferences.listStateFolders();

    if (!templates.length && !folders.length) {
      list.appendChild(el('div', 'tom-empty', I18n.t('organize.modal.noMatch')));
      return;
    }

    const view = TemplateOrganizer.buildView(templates, TemplatePreferences.getCached(), folders);

    TemplateTreeSelect.appendSections(list, view, (p) => makeLeafRow(p, 0, p.dossier, true), (n) => makeNode(n, 0));
  }

  function open() {
    if (!modal) return;
    modal.style.display = 'flex';
    searchTerm = '';
    placeTarget = null;
    if (searchInput) searchInput.value = '';
    render();
    // GFS range aussi dans la table du rangement : la liste s'ouvre sur ce qu'on sait, puis se redessine seulement si la relecture a trouvé du neuf.
    TemplateArrangement.reread();
    if (searchInput) searchInput.focus();
  }

  function close() {
    if (modal) modal.style.display = 'none';
    // Le dossier vide créé reste (sa ligne est écrite) ; seul le bouton « Ranger ici » qui le visait s'efface.
    placeTarget = null;
  }

  // Le rangement vient de changer sans passer par la fenêtre (Ctrl + Z, Ctrl + Y : js/template-arrangement.js) : la liste se redessine si la fenêtre est ouverte.
  function refresh() {
    if (modal && modal.style.display !== 'none') render();
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

  return { wire, open, close, refresh };
})();
