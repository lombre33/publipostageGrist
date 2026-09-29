// "Organiser mes modèles" (planning/feature-rangement-tri-modeles.md §4/§8.3) : modale dédiée pour créer
// des dossiers et y ranger des modèles - le "reste à faire" documenté depuis le câblage de la Piste B
// (js/template-tree-select.js, en-tête). Réutilise TemplateOrganizer.buildView et TemplatePreferences
// tels quels (js/template-organizer.js, js/template-preferences.js) : rien à changer dans ces deux
// fichiers pour cette modale.
//
// Un dossier n'existe QUE comme la valeur du champ Dossier d'au moins une préférence - pas de table de
// dossiers séparée (carte de décision, choix confirmé par Antoine le 2026-09-28 : "Créé en rangeant un
// modèle"). Conséquence directe sur les boutons "+" ci-dessous (ajoutés le même jour, second retour
// d'Antoine après le premier essai) : un "+" ne peut JAMAIS, à lui seul, persister un dossier vide. Il ne
// fait que nommer un chemin "en attente" (pendingFolder, état local, jamais écrit en base) affiché comme
// une ligne dossier à part jusqu'à ce qu'un modèle y soit effectivement rangé - par glisser-déposer ou par
// le bouton de repli "Ranger ici" (glisser-déposer n'a pas d'équivalent clavier/tactile fiable). Dès cette
// première écriture, TemplateOrganizer.buildView fait apparaître un vrai nœud dossier à cette place et la
// ligne "en attente" disparaît naturellement au render() suivant. Le bouton "Déplacer vers…" (chemin
// tapé à la main, prompt() texte libre) reste utilisable en toutes circonstances, y compris pour créer un
// dossier directement par ce biais - les "+"/le glisser-déposer sont additifs, pas un remplacement.
//
// Dossier déplié ou replié par défaut dans la liste déroulante (29/09, demande d'Antoine) : chaque ligne
// dossier porte un interrupteur (.tom-folder-default-btn) dont l'état est enregistré PAR UTILISATEUR
// (TemplatePreferences.setFolderCollapsed) et lu par js/template-tree-select.js à chaque ouverture de la
// liste. Cette modale-ci garde ses dossiers dépliés (il faut tout voir pour ranger) : l'interrupteur ne
// règle que la liste déroulante. Un dossier "en attente" n'existant pas en base, son interrupteur reste
// local (pendingCollapsed) et n'est écrit qu'au moment où un modèle y est rangé.
const TemplateOrganizeModal = (function () {
  let modal, searchInput, list, newFolderBtn;
  let searchTerm = '';
  let pendingFolder = null;
  let pendingCollapsed = false; // interrupteur du dossier en attente, écrit seulement quand il devient réel (cf. applyPendingFolderState)

  function currentTemplates() {
    return (typeof Templates !== 'undefined' && Templates.getCached()) || [];
  }
  function currentPreferences() {
    return (typeof TemplatePreferences !== 'undefined' && TemplatePreferences.getCached()) || {};
  }

  function iconSpan(typeModele) {
    const span = document.createElement('span');
    span.className = 'tts-icon tts-icon-' + (typeModele || 'document');
    return span;
  }

  // Après toute écriture (épingle/dossier), l'arbre de la barre d'outils doit refléter le changement sans
  // attendre une fermeture/réouverture - TemplateTreeSelect.refresh() existe déjà pour ça (utilisé aussi
  // par le chargement asynchrone des préférences au démarrage, js/main.js).
  function refreshTree() {
    if (typeof TemplateTreeSelect !== 'undefined') TemplateTreeSelect.refresh();
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

  // Nom du seul nouveau segment (pas le chemin complet) : le préfixe du parent est géré ici, pas tapé par
  // l'utilisateur - cf. commentaire d'en-tête sur pendingFolder.
  function promptNewFolderName(parentPath) {
    const value = window.prompt(I18n.t('organize.modal.newFolderPrompt'), '');
    if (value === null) return null;
    const full = parentPath ? parentPath + '/' + value : value;
    return TemplatePreferences.normalizeFolderPath(full);
  }

  // Le dossier en attente vient d'être créé en y rangeant un modèle : son interrupteur "replié par défaut", resté local jusque-là, est écrit
  // maintenant. Un échec ici ne défait pas le rangement (le dossier existe, déplié) : il est seulement journalisé.
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
    const value = window.prompt(hint, currentFolder || '');
    if (value === null) return; // Annulé : ne rien écrire (distinct d'une chaîne vide, qui vide le dossier).
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
      // setPinned() ne lève jamais pour une identification indisponible (repli anonyme silencieux, cf.
      // js/template-preferences.js) - même garde que js/template-tree-select.js.
      await TemplatePreferences.setPinned(id, !pinned);
      render();
      refreshTree();
    } catch (e) {
      console.error('[template-organize-modal] échec épinglage', e);
    }
  }

  // Bascule "s'ouvre déplié / replié" d'un dossier RÉEL. Le nouvel état est lu au moment du clic (pas dans la ligne dessinée : deux clics
  // rapides doivent bien revenir à l'état de départ) et l'interface suit tout de suite ; si Grist refuse l'écriture, le module revient au
  // dernier état confirmé et on redessine.
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

  // Interrupteur d'une ligne dossier (réelle ou en attente). Deux tracés distincts (dossier déplié : le contenu se lit sous l'en-tête ; replié :
  // l'en-tête seul et trois points), volontairement ni la punaise, ni l'étoile, ni un chevron (une icône = une fonction). L'info-bulle
  // dit l'état courant ET ce que fait le clic, comme celle de l'épingle.
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

  // folderLabel : uniquement pour les lignes épinglées (affichées à plat en tête, donc sans indentation
  // pour indiquer leur dossier) - une feuille dans l'arbre en dessous est déjà visuellement dans son
  // dossier grâce à l'indentation, cf. makeNode.
  function makeLeafRow(node, depth, folderLabel) {
    const row = document.createElement('div');
    row.className = 'tts-row tts-row-leaf';
    row.style.setProperty('--tts-depth', String(depth));
    row.dataset.templateId = String(node.id);

    // Glisser-déposer (2026-09-28, second retour d'Antoine) : seules les FEUILLES sont draggable, jamais
    // une ligne dossier - un dossier n'a pas d'identité propre à déplacer, seulement les modèles qu'il
    // contient (cf. commentaire d'en-tête). dragend se déclenche toujours (drop réussi, annulé ou en
    // dehors d'une cible) : sans lui une ligne resterait visuellement "figée" en cours de glissement.
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(node.id));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('tom-dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('tom-dragging'));

    row.appendChild(iconSpan(node.typeModele));
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

    const prefs = currentPreferences();
    const pref = prefs[node.id];
    const pinned = !!(pref && pref.epingle);
    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'tts-pin-btn';
    pinBtn.classList.toggle('is-pinned', pinned);
    pinBtn.setAttribute('aria-pressed', String(pinned));
    pinBtn.setAttribute('aria-label', I18n.t('templateTree.pin.aria'));
    // Info-bulle native (la modale vit hors de #toolbar-top : le [data-tip] de la barre ne s'y applique pas) - dit ce que fait le clic dans l'état
    // courant, pour ne pas le confondre avec l'étoile "modèle par défaut" de la barre.
    pinBtn.title = I18n.t(pinned ? 'templateTree.unpin.tip' : 'templateTree.pin.tip');
    pinBtn.addEventListener('click', () => togglePin(node.id, pinned));
    row.appendChild(pinBtn);

    const moveBtn = document.createElement('button');
    moveBtn.type = 'button';
    moveBtn.className = 'tom-move-btn';
    moveBtn.textContent = I18n.t('organize.modal.moveButton');
    moveBtn.addEventListener('click', () => moveTemplate(node.id, (pref && pref.dossier) || ''));
    row.appendChild(moveBtn);

    // Repli sans souris/tactile pendant qu'un dossier "en attente" existe (cf. commentaire d'en-tête) - le
    // glisser-déposer n'a pas d'équivalent clavier. N'apparaît que le temps qu'un dossier est en attente,
    // sur CHAQUE modèle (y compris celui déjà dans ce dossier en attente, cas déjà impossible puisque le
    // dossier n'existe pas encore réellement tant que rien n'y a été rangé).
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
    row.appendChild(iconSpan('folder'));
    const label = document.createElement('span');
    label.className = 'tts-row-label';
    label.textContent = node.nom;
    row.appendChild(label);

    const addSubBtn = document.createElement('button');
    addSubBtn.type = 'button';
    addSubBtn.className = 'tom-add-subfolder-btn';
    addSubBtn.setAttribute('aria-label', I18n.t('organize.modal.newSubfolderAria'));
    addSubBtn.textContent = '+';
    addSubBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = promptNewFolderName(node.chemin);
      if (!path) return;
      pendingFolder = path;
      pendingCollapsed = false;
      render();
    });
    row.appendChild(addSubBtn);
    row.appendChild(makeFolderDefaultButton(TemplatePreferences.isFolderCollapsed(node.chemin), 'folder-default:' + node.chemin, () => toggleFolderDefault(node.chemin)));

    const group = document.createElement('div');
    group.className = 'tts-group';
    // Profondeur du dossier (pas celle de ses enfants) : css/template-tree-select.css cale le trait guide du groupe sur le caret de CE dossier. Posée explicitement, sinon le groupe
    // hériterait de la profondeur du groupe parent.
    group.style.setProperty('--tts-depth', String(depth));
    node.enfants.forEach((child) => group.appendChild(makeNode(child, depth + 1)));

    row.addEventListener('click', () => {
      const expanded = row.getAttribute('aria-expanded') !== 'false';
      row.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      group.classList.toggle('is-collapsed', expanded);
    });

    // Cible de glisser-déposer (2026-09-28) : preventDefault() sur dragover est OBLIGATOIRE (règle HTML5
    // DnD), sinon 'drop' ne se déclenche jamais.
    row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('tom-drop-target'); });
    row.addEventListener('dragleave', () => row.classList.remove('tom-drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('tom-drop-target');
      const id = e.dataTransfer.getData('text/plain');
      if (id) dropOnFolder(id, node.chemin);
    });

    // Fragment (pas un <div> englobant) : même raison que js/template-tree-select.js:makeFolderRow -
    // `group` doit rester le frère direct de `row` pour un dossier imbriqué.
    const fragment = document.createDocumentFragment();
    fragment.appendChild(row);
    fragment.appendChild(group);
    return fragment;
  }

  function makeNode(node, depth) {
    return node.type === 'dossier' ? makeFolderRow(node, depth) : makeLeafRow(node, depth, null);
  }

  // Dossier "en attente" (cf. commentaire d'en-tête) : affiché à part, à plat, avec son chemin complet en
  // libellé plutôt que d'être spliced à sa position imbriquée dans l'arbre - un dossier qui n'existe pas
  // encore réellement n'a pas de place stable à lui trouver dans l'arbre affiché. Disparaît de lui-même
  // (view.tree le contient alors réellement) dès le premier modèle rangé dedans.
  function makePendingFolderRow(path) {
    const row = document.createElement('div');
    row.className = 'tts-row tts-row-folder tom-pending-folder';
    row.style.setProperty('--tts-depth', '0');
    row.appendChild(Object.assign(document.createElement('span'), { className: 'tts-folder-caret' }));
    row.appendChild(iconSpan('folder'));
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

  // Redessine la liste ET garde le focus et le défilement là où ils étaient. list.innerHTML = '' détruit le bouton qu'on vient de cliquer : le
  // focus retombait sur <body>, et Échap (écouté par la modale elle-même, cf. wireModalAccessibility dans js/main.js) ne fermait plus
  // rien - or à 700x400 le bouton « Fermer » est hors de la fenêtre. Le bouton est retrouvé par data-focus-key ; à défaut (le bouton a
  // disparu avec le redessin, ex. « Ranger ici ») le focus va à la liste elle-même (tabindex -1, hors piège de Tab).
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
    const templates = currentTemplates().filter((t) => !term || String(t.nom ?? '').toLowerCase().includes(term));

    if (!templates.length) {
      const empty = document.createElement('div');
      empty.className = 'tom-empty';
      empty.textContent = I18n.t('organize.modal.noMatch');
      list.appendChild(empty);
      return;
    }

    const view = TemplateOrganizer.buildView(templates, currentPreferences());

    // Le dossier en attente vient d'être réellement créé (un modèle y a été rangé depuis) : il apparaît
    // maintenant à sa vraie place dans view.tree, plus la peine de le montrer à part.
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
    // Aucune trace, aucune écriture Grist n'a eu lieu pour un dossier resté "en attente" (cf. commentaire
    // d'en-tête) - fermer la modale l'abandonne silencieusement, comme annuler le prompt "Déplacer vers…".
    pendingFolder = null;
    pendingCollapsed = false;
  }

  function onNewRootFolder() {
    const path = promptNewFolderName('');
    if (!path) return;
    pendingFolder = path;
    pendingCollapsed = false;
    render();
  }

  // Branché une seule fois à l'init (js/main.js), même patron que MacroEditor.wire(). wireModalAccessibility()
  // (js/main.js) prend en charge Échap/piège de focus/restauration une fois l'id ajouté à sa liste MODALS -
  // rien à refaire ici pour ça.
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
