// "Organiser mes modèles" (planning/feature-rangement-tri-modeles.md §4/§8.3) : modale dédiée pour créer
// des dossiers et y ranger des modèles - le "reste à faire" documenté depuis le câblage de la Piste B
// (js/template-tree-select.js, en-tête). Réutilise TemplateOrganizer.buildView et TemplatePreferences
// tels quels (js/template-organizer.js, js/template-preferences.js) : rien à changer dans ces deux
// fichiers pour cette modale.
//
// Un dossier n'existe QUE comme la valeur du champ Dossier d'au moins une préférence - pas de table de
// dossiers séparée (carte de décision posée à Antoine le 2026-09-28, option recommandée retenue en
// attendant sa réponse : pas de raison de bloquer sur une question réversible). Conséquence directe sur
// cette UI : il n'y a PAS de bouton "+ Nouveau dossier" autonome comme sur la maquette d'origine - créer
// un dossier se fait UNIQUEMENT en y déplaçant un premier modèle (bouton "Déplacer vers…", prompt() texte
// libre pré-rempli avec le dossier actuel, même patron que prompt.newTemplateName/prompt.newTableName
// déjà utilisés ailleurs dans ce projet). Taper un chemin avec "/" crée un sous-dossier au passage
// (TemplatePreferences.normalizeFolderPath gère déjà cette syntaxe).
const TemplateOrganizeModal = (function () {
  let modal, searchInput, list;
  let searchTerm = '';

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

  async function moveTemplate(id, currentFolder) {
    const folders = TemplatePreferences.listFolders();
    const hint = folders.length
      ? I18n.t('organize.modal.moveHint', { folders: folders.join(', ') })
      : I18n.t('organize.modal.moveHintEmpty');
    const value = window.prompt(hint, currentFolder || '');
    if (value === null) return; // Annulé : ne rien écrire (distinct d'une chaîne vide, qui vide le dossier).
    try {
      await TemplatePreferences.setFolder(id, value);
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

  // folderLabel : uniquement pour les lignes épinglées (affichées à plat en tête, donc sans indentation
  // pour indiquer leur dossier) - une feuille dans l'arbre en dessous est déjà visuellement dans son
  // dossier grâce à l'indentation, cf. makeNode.
  function makeLeafRow(node, depth, folderLabel) {
    const row = document.createElement('div');
    row.className = 'tts-row tts-row-leaf';
    row.style.setProperty('--tts-depth', String(depth));

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
    pinBtn.addEventListener('click', () => togglePin(node.id, pinned));
    row.appendChild(pinBtn);

    const moveBtn = document.createElement('button');
    moveBtn.type = 'button';
    moveBtn.className = 'tom-move-btn';
    moveBtn.textContent = I18n.t('organize.modal.moveButton');
    moveBtn.addEventListener('click', () => moveTemplate(node.id, (pref && pref.dossier) || ''));
    row.appendChild(moveBtn);

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

    const group = document.createElement('div');
    group.className = 'tts-group';
    node.enfants.forEach((child) => group.appendChild(makeNode(child, depth + 1)));

    row.addEventListener('click', () => {
      const expanded = row.getAttribute('aria-expanded') !== 'false';
      row.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      group.classList.toggle('is-collapsed', expanded);
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

  function render() {
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
  }

  function open() {
    if (!modal) return;
    modal.style.display = 'flex';
    searchTerm = '';
    if (searchInput) searchInput.value = '';
    render();
    if (searchInput) searchInput.focus();
  }

  function close() {
    if (modal) modal.style.display = 'none';
  }

  // Branché une seule fois à l'init (js/main.js), même patron que MacroEditor.wire(). wireModalAccessibility()
  // (js/main.js) prend en charge Échap/piège de focus/restauration une fois l'id ajouté à sa liste MODALS -
  // rien à refaire ici pour ça.
  function wire() {
    modal = document.getElementById('template-organize-modal');
    searchInput = document.getElementById('template-organize-search');
    list = document.getElementById('template-organize-list');
    const closeBtn = document.getElementById('template-organize-close');
    if (!modal || !searchInput || !list || !closeBtn) return;
    closeBtn.addEventListener('click', close);
    searchInput.addEventListener('input', () => { searchTerm = searchInput.value || ''; render(); });
  }

  return { wire, open, close };
})();
