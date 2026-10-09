// Galerie « Créer à partir d'un modèle » (js/main.js : wireTemplateGalleryModal) : la grille des modèles du catalogue (js/template-gallery.js) avec
// sa recherche et ses étiquettes, l'aperçu d'un modèle, et les façons de partir de lui : « Utiliser ce modèle » (le texte seul), « Utiliser avec une
// nouvelle table de données » (les anciens modèles : une table de colonnes simples) et « Créer avec ses tables » (les modèles à pack, js/template-pack.js :
// les tables du modèle, vides, avec leurs calculs, leurs liens et la page du modèle).
// L'aperçu d'un modèle à captures montre le document rempli de lignes d'exemple, en images faites avec le vrai widget (dev-tests/gallery-captures.mjs) :
// aucune ligne n'est jamais écrite dans le document. Sans captures (ou si elles ne chargent pas), l'aperçu en lecture seule est une simple reconstruction
// DOM passive (innerHTML dans un conteneur .tiptap), pas une seconde instance TipTap, donc sans risque pour le document en cours d'édition.
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
  let previewSheet = null;
  let previewNote = null;
  let previewShows = null;
  let previewCaptures = null;
  let previewCaptureNote = null;
  let previewUseData = null;
  let previewUsePack = null;
  let manifest = [];
  let activeTag = '';
  let currentEntry = null;
  let currentHtml = '';
  let currentPack = null; // le pack validé du modèle ouvert (js/template-pack.js), null pour un modèle sans pack
  let previewToken = 0; // la dernière ouverture d'aperçu : une réponse qui arrive après un autre clic ou une fermeture ne repeint rien
  let useStartedAt = 0; // 0 : aucune création en cours

  const isRaster = path => /\.(png|jpe?g|webp)$/i.test(String(path || ''));

  function renderGrid() {
    const matchesName = SearchSelect.nameMatcher(searchInput.value);
    const filtered = manifest.filter(entry => {
      const matchesTerm = matchesName(entry.name);
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
      if (isRaster(entry.screenshot)) shot.classList.add('is-capture');
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

  // ---- L'aperçu ----

  // La page du modèle dans une phrase (« Page A6 portrait. »), vide pour l'A4 en portrait que personne ne remarque.
  function pageNote(pack) {
    const page = pack.template.page;
    if (page.format === 'A4' && page.orientation === 'portrait') return '';
    const orientation = I18n.t(page.orientation === 'landscape' ? 'sheetAssembly.orientation.landscape' : 'sheetAssembly.orientation.portrait').toLowerCase();
    return I18n.t('gallery.packPage', { format: PageLayout.formatLabel(page.format, page.orientation), orientation });
  }

  // La ligne sous le nom (les tables que « Créer avec ses tables » ajoutera, la page), les fonctions montrées et le bouton « Créer avec ses tables » :
  // tout ce qui dépend du pack et de la langue. Appelée à l'ouverture (vide), quand le pack est lu et au changement de langue.
  function renderPreviewMeta() {
    const entry = currentEntry;
    const pack = currentPack;
    const note = pack ? [I18n.t('gallery.packTables', { tables: pack.tables.map(table => table.id).join(', ') }), pageNote(pack)].filter(Boolean).join(' ') : '';
    previewNote.textContent = note;
    previewNote.hidden = !note;
    previewShows.replaceChildren();
    const shows = entry && Array.isArray(entry.shows) ? entry.shows : [];
    if (shows.length) {
      const label = document.createElement('span');
      label.className = 'tpl-preview-shows-label';
      label.textContent = I18n.t('gallery.showsLabel');
      previewShows.appendChild(label);
      shows.forEach(key => {
        const chip = document.createElement('span');
        chip.className = 'tpl-preview-chip';
        chip.textContent = I18n.t('gallery.shows.' + key);
        previewShows.appendChild(chip);
      });
    }
    previewShows.hidden = !shows.length;
    previewUsePack.hidden = !pack;
    previewModal.classList.toggle('has-pack', !!pack);
    if (pack) previewUsePack.textContent = I18n.t('gallery.useWithTables', { n: pack.tables.length });
  }

  function showLivePreview() {
    previewCaptures.hidden = true;
    previewCaptureNote.hidden = true;
    previewSheet.hidden = false;
    // Un aperçu s'affiche : une image d'un autre site (la vitrine de ?dev en a) y prend son cadre « Afficher » ; le modèle enregistré garde son HTML.
    previewTiptap.innerHTML = ExternalImages.block(HtmlSanitize.clean(currentHtml), { zoom: 1 }); // pas de feuille réduite dans cette fenêtre
  }

  // Les captures du document rempli, une image par page, à leur taille d'écran. Une image qui ne charge pas (fichier absent d'un déploiement) rend la
  // main à l'aperçu en lecture seule : la fenêtre ne montre jamais une image cassée.
  function showCaptures(entry, token) {
    previewCaptures.replaceChildren();
    entry.preview.forEach((shot, index) => {
      const img = document.createElement('img');
      img.alt = I18n.t('gallery.captureAlt', { name: entry.name, page: index + 1 });
      if (shot.w > 0 && shot.h > 0) { img.width = shot.w; img.height = shot.h; }
      img.addEventListener('error', () => { if (token === previewToken) showLivePreview(); }, { once: true });
      img.src = TemplateGallery.resolveUrl(shot.src, entry);
      previewCaptures.appendChild(img);
    });
    previewCaptures.hidden = false;
    previewCaptureNote.hidden = false;
    previewSheet.hidden = true;
  }

  async function openPreview(entry) {
    const token = ++previewToken;
    currentEntry = entry;
    currentHtml = '';
    currentPack = null;
    galleryModal.style.display = 'none';
    previewModal.style.display = 'flex';
    previewName.textContent = entry.name;
    previewTiptap.innerHTML = '';
    previewCaptures.replaceChildren();
    previewCaptures.hidden = true;
    previewCaptureNote.hidden = true;
    previewSheet.hidden = false;
    // Un modèle à pack remplace « avec une nouvelle table de données » : ses tables viennent de son pack, pas de son schema.py.
    previewUseData.hidden = !entry.schema || !!entry.pack;
    renderPreviewMeta();
    const [html, pack] = await Promise.allSettled([TemplateGallery.fetchHtml(entry), TemplateGallery.fetchPack(entry)]);
    if (token !== previewToken) return;
    if (pack.status === 'rejected') {
      console.error('[template-gallery-modal] échec du chargement du pack', pack.reason);
      host.setStatus(I18n.t('status.packLoadError'), true);
    } else currentPack = pack.value;
    if (html.status === 'rejected') {
      console.error('[template-gallery-modal] échec du chargement du modèle', html.reason);
      host.setStatus(I18n.t('status.templateLoadError'), true);
    } else {
      currentHtml = html.value;
      if (Array.isArray(entry.preview) && entry.preview.length) showCaptures(entry, token);
      else showLivePreview();
    }
    renderPreviewMeta();
  }

  function closeAll() {
    previewToken++;
    galleryModal.style.display = 'none';
    previewModal.style.display = 'none';
  }

  // ---- Créer le modèle ----

  // Ce que le modèle enregistré reçoit en plus de son texte quand la galerie le tire d'un pack : la page (format, sens, marges), le type (document,
  // e-mail, grille), le nom du fichier PDF et les champs de l'e-mail. `bare` (« Utiliser ce modèle », sans les tables) garde la page et le type mais pas
  // les noms de fichier ni d'e-mail, qui parlent de variables d'une table que le document n'a peut-être pas.
  function packSettings(pack, bare) {
    if (!pack) return {};
    const email = pack.template.email;
    return {
      marginsMm: TemplatePack.marginsOf(pack),
      typeModele: pack.template.type,
      nomFichierPDF: bare ? '' : pack.template.pdfName,
      destinataires: bare ? '' : email.destinataires,
      cc: bare ? '' : email.cc,
      cci: bare ? '' : email.cci,
      objet: bare ? '' : email.objet,
    };
  }

  // Charger le modèle ne suffit pas : sans enregistrement explicite, il ne reste qu'un tampon d'édition, invisible dans #template-select. Passe par
  // onSave plutôt que d'appeler Templates.save à part.
  async function saveEntryAsTemplate(html, settings) {
    const headerFooter = await TemplateGallery.fetchHeaderFooter(currentEntry);
    host.clearTemplateSelection();
    host.loadTemplateIntoEditor(Object.assign({ id: null, contenu: html, headerFooter, nom: currentEntry.name, nomFichierPDF: '' }, settings || {}));
    await host.onSave();
    closeAll();
  }

  async function useEmpty() {
    if (!currentEntry || !currentHtml) return;
    // Le nouveau modèle remplace l'éditeur : même question que pour un changement de modèle (« Annuler » laisse la galerie ouverte, rien n'est
    // créé).
    if (host.hasEditsToConfirmBeforeLeaving() && !(await host.askBeforeLeaving())) return;
    await saveEntryAsTemplate(TemplateGallery.stripVariableBadges(currentHtml), packSettings(currentPack, true));
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
      // Le vrai Grist rend { id, table_id, columns, views } ; le faux de dev-tests/ rendait { tableId } : les deux se lisent.
      const created = result && result.retValues && result.retValues[0];
      if (created && (created.table_id || created.tableId)) actualTableId = created.table_id || created.tableId;
    } catch (e) {
      console.error('[template-gallery-modal] échec de la création de la table', e);
      host.setStatus(I18n.t('status.tableCreationError', { table: tableName }), true);
      return;
    }
    await saveEntryAsTemplate(TemplateGallery.rebindVariableTable(currentHtml, schema.tableName, actualTableId));
    host.setStatus(I18n.t('status.tableCreatedSummary', { table: actualTableId, count: schema.columns.length, name: host.savedTemplateName(currentEntry.name) }));
  }

  // La question avant de créer : les tables à créer (avec leurs colonnes, dont celles de calcul), celles qui y sont déjà et restent telles quelles.
  function confirmMessage(pack, plan) {
    const lines = [I18n.t('dialog.pack.intro', { name: currentEntry.name, n: plan.create.length })];
    plan.create.forEach(id => {
      const table = pack.tables.find(t => t.id === id);
      const calc = table.columns.filter(column => column.formula).length;
      lines.push(I18n.t(calc ? 'dialog.pack.tableLineCalc' : 'dialog.pack.tableLine', { table: id, columns: table.columns.length, calc }));
    });
    const notes = [];
    if (plan.reuse.length) notes.push(I18n.t('dialog.pack.reused', { tables: plan.reuse.join(', ') }));
    if (pack.links.length) notes.push(I18n.t('dialog.pack.links'));
    if (notes.length) lines.push('', ...notes);
    return lines.join('\n');
  }

  // Le refus : une ligne par table qui gêne (colonnes manquantes, type différent, nom pris sans respecter la casse), puis quoi faire.
  function conflictMessage(conflicts) {
    const lines = [I18n.t('dialog.pack.conflictIntro', { name: currentEntry.name }), ''];
    conflicts.forEach(conflict => {
      const table = conflict.table;
      const named = conflict.problems.find(problem => problem.kind === 'name');
      if (named) { lines.push(I18n.t('dialog.pack.conflictName', { table, found: named.found })); return; }
      const missing = conflict.problems.filter(problem => problem.kind === 'missing').map(problem => problem.column);
      if (missing.length) lines.push(I18n.t('dialog.pack.conflictMissing', { table, columns: missing.join(', ') }));
      conflict.problems.filter(problem => problem.kind === 'type').forEach(problem => lines.push(I18n.t('dialog.pack.conflictType', { table, column: problem.column, found: problem.found, wanted: problem.wanted })));
    });
    lines.push('', I18n.t('dialog.pack.conflictAdvice'));
    return lines.join('\n');
  }

  // Une seule touche : « Fermer » (Dialogs.choose sans choix ne garde que le bouton d'annulation).
  function showConflicts(conflicts) {
    return Dialogs.choose({ title: I18n.t('dialog.pack.conflictTitle'), message: conflictMessage(conflicts), choices: [], cancelLabel: I18n.t('common.close') });
  }

  async function useWithPack() {
    if (!currentEntry || !currentHtml || !currentPack) return;
    const pack = currentPack;
    // Avant tout effet : « Annuler » ne laisse rien derrière elle (ni table ni modèle).
    if (host.hasEditsToConfirmBeforeLeaving() && !(await host.askBeforeLeaving())) return;
    let plan;
    try { plan = TemplatePack.plan(pack, await TemplatePack.readDocumentSchema()); }
    catch (e) {
      console.error('[template-gallery-modal] échec de la lecture des tables du document', e);
      host.setStatus(I18n.t('status.packReadError'), true);
      return;
    }
    if (plan.conflicts.length) { await showConflicts(plan.conflicts); return; }
    if (plan.create.length && !(await Dialogs.confirm({ title: I18n.t('dialog.pack.title'), message: confirmMessage(pack, plan), confirmLabel: I18n.t('common.create') }))) return;
    let result;
    try { result = await TemplatePack.apply(pack); }
    catch (e) {
      // Un conflit apparu entre la question et la création (une autre fenêtre a créé une table) se dit comme le premier ; les autres échecs, au coin d'état.
      if (TemplatePack.isPackError(e) && e.packCode === 'conflict') { await showConflicts(e.details.conflicts); return; }
      console.error('[template-gallery-modal] échec de la création des tables du modèle', e);
      host.setStatus(I18n.t(TemplatePack.isPackError(e) && e.packCode === 'renamed' ? 'status.packRenamed' : 'status.packError'), true);
      return;
    }
    await saveEntryAsTemplate(currentHtml, packSettings(pack, false));
    const name = host.savedTemplateName(currentEntry.name);
    const parts = [result.created.length
      ? I18n.t('status.packCreated', { name, n: result.created.length, tables: result.created.join(', ') })
      : I18n.t('status.packReused', { name, n: result.reused.length, tables: result.reused.join(', ') })];
    if (result.linksKept.length) parts.push(I18n.t('status.packLinksKept', { n: result.linksKept.length, tables: result.linksKept.join(', ') }));
    host.setStatus(parts.join(' '));
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
    previewSheet = document.getElementById('tpl-preview-sheet');
    previewNote = document.getElementById('tpl-preview-note');
    previewShows = document.getElementById('tpl-preview-shows');
    previewCaptures = document.getElementById('tpl-preview-captures');
    previewCaptureNote = document.getElementById('tpl-preview-capture-note');
    previewUseData = document.getElementById('tpl-preview-use-data');
    previewUsePack = document.getElementById('tpl-preview-use-pack');
    if (!openLink || !galleryModal || !grid || !previewModal) return;
    host = options;

    openLink.addEventListener('click', openGallery);
    if (galleryClose) galleryClose.addEventListener('click', closeAll);
    if (previewCloseBtn) previewCloseBtn.addEventListener('click', closeAll);
    if (previewBack) previewBack.addEventListener('click', () => { previewToken++; previewModal.style.display = 'none'; galleryModal.style.display = 'flex'; });
    if (searchInput) searchInput.addEventListener('input', renderGrid);
    // La ligne sous le nom, les pastilles et le bouton « Créer avec ses tables » se composent à l'exécution : ils suivent la langue de l'interface.
    I18n.onChange(() => { if (currentEntry && previewModal.style.display !== 'none') renderPreviewMeta(); });
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
    if (previewUsePack) previewUsePack.addEventListener('click', once(useWithPack));
  }

  return { wire };
})();
