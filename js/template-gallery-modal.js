// Galerie « Créer à partir d'un modèle » (js/main.js : wireTemplateGalleryModal) : la grille des modèles du catalogue (js/template-gallery.js) avec
// sa recherche et ses étiquettes, l'aperçu d'un modèle, et les deux façons de partir de lui (« Utiliser ce modèle », « Utiliser avec une nouvelle table
// de données »). L'aperçu en lecture seule est une simple reconstruction DOM passive (innerHTML dans un conteneur .tiptap), pas une seconde instance
// TipTap, donc sans risque pour le document en cours d'édition.
// Ce que la galerie demande à js/main.js lui est donné à wire : changer le modèle de l'éditeur, l'enregistrer, poser un message dans le coin d'état,
// poser la question « Enregistrer / Abandonner / Annuler » quand une modification attend.
const TemplateGalleryModal = (function () {
  let host = null; // ce que js/main.js met à la disposition de la galerie (cf. wire)
  let galleryModal = null;
  let grid = null;
  let tagsBar = null;
  let searchInput = null;
  let previewModal = null;
  let previewName = null;
  let previewTiptap = null;
  let previewUseData = null;
  let manifest = [];
  let activeTag = '';
  let currentEntry = null;
  let currentHtml = '';
  let useStartedAt = 0; // 0 : aucune création en cours

  function renderGrid() {
    const term = (searchInput.value || '').trim().toLowerCase();
    const filtered = manifest.filter(entry => {
      const matchesTerm = !term || entry.name.toLowerCase().includes(term);
      const matchesTag = !activeTag || (entry.tags || []).includes(activeTag);
      return matchesTerm && matchesTag;
    });
    grid.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'tpl-gallery-empty';
      empty.textContent = I18n.t('gallery.noMatch');
      grid.appendChild(empty);
      return;
    }
    filtered.forEach(entry => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'tpl-gallery-card';
      // Le nom et les mots-clés viennent d'un manifeste : du texte, jamais du HTML.
      const shot = document.createElement('img');
      shot.src = TemplateGallery.resolveUrl(entry.screenshot, entry);
      shot.alt = entry.name;
      const cardName = document.createElement('span');
      cardName.className = 'tpl-gallery-card-name';
      cardName.textContent = entry.name;
      const cardTags = document.createElement('span');
      cardTags.className = 'tpl-gallery-card-tags';
      (entry.tags || []).forEach(t => { const tag = document.createElement('span'); tag.textContent = t; cardTags.appendChild(tag); });
      card.append(shot, cardName, cardTags);
      card.addEventListener('click', () => openPreview(entry));
      grid.appendChild(card);
    });
  }

  function renderTags() {
    const allTags = Array.from(new Set(manifest.flatMap(entry => entry.tags || [])));
    tagsBar.innerHTML = '';
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'tpl-gallery-tag' + (activeTag ? '' : ' is-active');
    allChip.textContent = I18n.t('gallery.allTag');
    allChip.addEventListener('click', () => { activeTag = ''; renderTags(); renderGrid(); });
    tagsBar.appendChild(allChip);
    allTags.forEach(tag => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tpl-gallery-tag' + (activeTag === tag ? ' is-active' : '');
      chip.textContent = tag;
      chip.addEventListener('click', () => { activeTag = tag; renderTags(); renderGrid(); });
      tagsBar.appendChild(chip);
    });
  }

  async function openGallery() {
    galleryModal.style.display = 'flex';
    if (!manifest.length) {
      try { manifest = await TemplateGallery.loadManifest(); }
      catch (e) {
        console.error('[template-gallery-modal] échec du chargement du manifeste', e);
        host.setStatus(I18n.t('status.galleryLoadError'), true);
      }
    }
    renderTags();
    renderGrid();
  }

  async function openPreview(entry) {
    currentEntry = entry;
    currentHtml = '';
    galleryModal.style.display = 'none';
    previewModal.style.display = 'flex';
    previewName.textContent = entry.name;
    previewTiptap.innerHTML = '';
    previewUseData.hidden = !entry.schema;
    try {
      currentHtml = await TemplateGallery.fetchHtml(entry);
      // Un aperçu s'affiche : une image d'un autre site (la vitrine de ?dev en a) y prend son cadre « Afficher » ; le modèle enregistré garde son HTML.
      previewTiptap.innerHTML = ExternalImages.block(HtmlSanitize.clean(currentHtml), { zoom: 1 }); // pas de feuille réduite dans cette fenêtre
    } catch (e) {
      console.error('[template-gallery-modal] échec du chargement du modèle', e);
      host.setStatus(I18n.t('status.templateLoadError'), true);
    }
  }

  function closeAll() {
    galleryModal.style.display = 'none';
    previewModal.style.display = 'none';
  }

  // Charger le modèle ne suffit pas : sans enregistrement explicite, il ne reste qu'un tampon d'édition, invisible dans #template-select. Passe par
  // onSave plutôt que d'appeler Templates.save à part.
  async function saveEntryAsTemplate(html) {
    const headerFooter = await TemplateGallery.fetchHeaderFooter(currentEntry);
    host.clearTemplateSelection();
    host.loadTemplateIntoEditor({ id: null, contenu: html, headerFooter, nom: currentEntry.name, nomFichierPDF: '' });
    await host.onSave();
    closeAll();
  }

  async function useEmpty() {
    if (!currentEntry || !currentHtml) return;
    // Le nouveau modèle remplace l'éditeur : même question que pour un changement de modèle (« Annuler » laisse la galerie ouverte, rien n'est
    // créé).
    if (host.hasEditsToConfirmBeforeLeaving() && !(await host.askBeforeLeaving())) return;
    await saveEntryAsTemplate(TemplateGallery.stripVariableBadges(currentHtml));
    host.setStatus(I18n.t('status.templateSavedAsNew', { name: host.savedTemplateName(currentEntry.name) }));
  }

  async function useWithData() {
    if (!currentEntry || !currentHtml) return;
    // Avant tout effet (la table Grist n'est créée qu'après) : « Annuler » ne laisse rien derrière elle.
    if (host.hasEditsToConfirmBeforeLeaving() && !(await host.askBeforeLeaving())) return;
    let schema;
    try { schema = await TemplateGallery.fetchSchema(currentEntry); }
    catch (e) {
      console.error('[template-gallery-modal] échec du chargement du schéma', e);
      host.setStatus(I18n.t('status.schemaLoadError'), true);
      return;
    }
    if (!schema || !schema.columns.length) { host.setStatus(I18n.t('status.noColumnsDefined'), true); return; }
    const defaultName = schema.tableName || currentEntry.name.replace(/[^a-zA-Z0-9_]+/g, '_');
    const tableName = await Dialogs.prompt({ title: I18n.t('dialog.newTable.title'), label: I18n.t('prompt.newTableName'), value: defaultName, confirmLabel: I18n.t('common.create') });
    if (!tableName) return;
    // Les badges #Variable du HTML statique pointent vers schema.tableName : si Grist crée la table sous un autre nom (renommée à la saisie, ou
    // dédupliquée), ces références sont réalignées avant de charger le HTML, faute de quoi les variables pointeraient vers une table inexistante.
    let actualTableId = tableName;
    try {
      const result = await grist.docApi.applyUserActions([['AddTable', tableName, schema.columns]]);
      if (result && result.retValues && result.retValues[0] && result.retValues[0].tableId) {
        actualTableId = result.retValues[0].tableId;
      }
    } catch (e) {
      console.error('[template-gallery-modal] échec de la création de la table', e);
      host.setStatus(I18n.t('status.tableCreationError', { table: tableName }), true);
      return;
    }
    await saveEntryAsTemplate(TemplateGallery.rebindVariableTable(currentHtml, schema.tableName, actualTableId));
    host.setStatus(I18n.t('status.tableCreatedSummary', { table: actualTableId, count: schema.columns.length, name: host.savedTemplateName(currentEntry.name) }));
  }

  // `options` (gardé dans `host`) : { clearTemplateSelection, loadTemplateIntoEditor, onSave, setStatus, hasEditsToConfirmBeforeLeaving,
  // askBeforeLeaving, savedTemplateName, saveWatchdogMs }.
  function wire(options) {
    const openLink = document.getElementById('v2-btn-new-from-template');
    const galleryClose = document.getElementById('tpl-gallery-close');
    const previewUseEmpty = document.getElementById('tpl-preview-use-empty');
    const previewBack = document.getElementById('tpl-preview-back');
    const previewCloseBtn = document.getElementById('tpl-preview-close');
    galleryModal = document.getElementById('template-gallery-modal');
    grid = document.getElementById('tpl-gallery-grid');
    tagsBar = document.getElementById('tpl-gallery-tags');
    searchInput = document.getElementById('tpl-gallery-search');
    previewModal = document.getElementById('template-preview-modal');
    previewName = document.getElementById('tpl-preview-name');
    previewTiptap = document.getElementById('tpl-preview-tiptap');
    previewUseData = document.getElementById('tpl-preview-use-data');
    if (!openLink || !galleryModal || !grid || !previewModal) return;
    host = options;

    openLink.addEventListener('click', openGallery);
    if (galleryClose) galleryClose.addEventListener('click', closeAll);
    if (previewCloseBtn) previewCloseBtn.addEventListener('click', closeAll);
    if (previewBack) previewBack.addEventListener('click', () => { previewModal.style.display = 'none'; galleryModal.style.display = 'flex'; });
    if (searchInput) searchInput.addEventListener('input', renderGrid);
    // Un seul « Utiliser… » à la fois : avec Grist lent, rien ne bouge à l'écran et la personne clique une deuxième fois, ce qui créerait un second
    // modèle (« Facture » puis « Facture (2) ») ou, sur « Utiliser avec une nouvelle table de données », rouvrirait la fenêtre du nom avant la fin de
    // la première création. Le clic en trop est ignoré tant que la première création n'est pas finie ; une création qui ne revient jamais ne bloque
    // pas les boutons au-delà de saveWatchdogMs.
    const once = (action) => async function () {
      if (useStartedAt && Date.now() - useStartedAt < host.saveWatchdogMs) return;
      const startedAt = useStartedAt = Date.now();
      try { await action(); } finally { if (useStartedAt === startedAt) useStartedAt = 0; }
    };
    previewUseEmpty.addEventListener('click', once(useEmpty));
    previewUseData.addEventListener('click', once(useWithData));
  }

  return { wire };
})();
