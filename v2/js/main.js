// Orchestration V2 — même structure que js/main.js (V1), volontairement
// simplifiée pour cet incrément agile : gestion de modèles + mode Édition/
// Lecture + export PDF (vectoriel uniquement, cf. v2/js/pdf-export.js) +
// câblage Grist (variables/tableaux/2 colonnes/images/sommaire sont gérés
// dans v2/js/editor.js, pas ici) + modale "Tables liées" (règles de
// correspondance inter-tables, cf. wireLinkRulesModal/v2/js/variables.js).
// `Editor.init()` est ASYNC ici (contrairement à V1) - v2/js/editor.js
// charge TipTap/ProseMirror via import() dynamique au moment de l'appel.
(function () {
  let currentMode = 'edit';
  let currentTableId = null;
  let latestRecord = null;
  let latestRecordTableId = null;

  const statusMsg = document.getElementById('status-msg');
  const templateSelect = document.getElementById('template-select');
  const templateNameInput = document.getElementById('template-name');
  const pdfFilenameInput = document.getElementById('pdf-filename-template');
  const editorContainer = document.getElementById('editor-container');
  const readerContainer = document.getElementById('reader-container');
  const btnEdit = document.getElementById('btn-mode-edit');
  const btnRead = document.getElementById('btn-mode-read');

  function setStatus(msg, isError) {
    statusMsg.textContent = msg;
    statusMsg.className = isError ? 'error-msg' : '';
  }

  function getPdfFilenameTemplate() {
    return pdfFilenameInput ? pdfFilenameInput.value.trim() : '';
  }

  async function refreshTemplateList() {
    const templates = await Templates.loadAll();
    templateSelect.innerHTML = '';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = I18n.t('template.newOption');
    templateSelect.appendChild(emptyOpt);
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.nom;
      templateSelect.appendChild(opt);
    });
  }

  function loadTemplateIntoEditor(tpl) {
    closeTemplateRenameEditor();
    // Changer de modèle en pleine édition d'en-tête/pied de page laisserait
    // sinon le contenu d'en-tête chargé à la place du document principal
    // qu'on s'apprête à écraser - même garde que Save/Export/Mode Lecture.
    Editor.exitHeaderFooterModeIfActive();
    Editor.setHTML(tpl ? tpl.contenu : '');
    Editor.setHeaderFooterData(tpl ? tpl.headerFooter : null);
    if (templateNameInput) templateNameInput.value = tpl ? tpl.nom : '';
    if (pdfFilenameInput) {
      pdfFilenameInput.value = tpl ? (tpl.nomFichierPDF || '') : '';
      // Reste visible si un nom est déjà configuré - éviter de cacher un
      // réglage actif derrière le crayon (cf. wirePdfFilenameToggle).
      pdfFilenameInput.hidden = !pdfFilenameInput.value.trim();
    }
    Templates.setCurrentId(tpl ? tpl.id : null);
    const headingNumberingSelect = document.getElementById('v2-heading-numbering-select');
    if (headingNumberingSelect) headingNumberingSelect.value = Editor.getHeadingNumberingStyle();
    // Changer de modèle ne touchait jusqu'ici que #editor-container (caché en
    // mode Lecture) - #reader-container ne se rafraîchissait donc jamais tant
    // qu'on ne repassait pas explicitement par le bouton "Mode édition" puis
    // "Mode lecture" (signalé cassé par l'utilisateur : le changement de
    // modèle "ne change rien" en mode Lecture).
    if (currentMode === 'read') renderReader();
  }

  // Cluster "modèle" (cf. v2/index.html #v2-title-cluster) : le select
  // choisit/affiche le modèle courant, le crayon fait apparaître l'input
  // (déjà existant, seulement masqué par défaut) À SA PLACE pour le
  // renommer - remplace les deux champs en permanence visibles de l'ancienne
  // UI. Le renommage ne touche que l'affichage local (libellé de l'option
  // sélectionnée) : la persistance réelle reste celle d'avant, au prochain
  // clic sur Enregistrer (onSave lit templateNameInput.value).
  function closeTemplateRenameEditor() {
    if (!templateNameInput || !templateSelect) return;
    templateNameInput.hidden = true;
    templateSelect.hidden = false;
  }

  function wireTemplateRename() {
    const renameBtn = document.getElementById('btn-rename-template');
    if (!renameBtn || !templateNameInput || !templateSelect) return;
    function openEditor() {
      templateNameInput.hidden = false;
      templateSelect.hidden = true;
      templateNameInput.focus();
      templateNameInput.select();
    }
    function commitAndClose() {
      const opt = templateSelect.options[templateSelect.selectedIndex];
      if (opt && templateNameInput.value.trim()) opt.textContent = templateNameInput.value.trim();
      closeTemplateRenameEditor();
    }
    renameBtn.addEventListener('click', () => { templateNameInput.hidden ? openEditor() : commitAndClose(); });
    templateNameInput.addEventListener('blur', commitAndClose);
    templateNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') templateNameInput.blur(); });
  }

  async function onTemplateSelectChange() {
    const id = templateSelect.value;
    if (!id) { loadTemplateIntoEditor(null); return; }
    const tpl = Templates.getCached().find(t => String(t.id) === String(id));
    if (tpl) loadTemplateIntoEditor(tpl);
  }

  async function onNew() {
    templateSelect.value = '';
    loadTemplateIntoEditor(null);
    setStatus(I18n.t('status.newTemplateReady'));
  }

  async function onSave() {
    Editor.exitHeaderFooterModeIfActive();
    const id = Templates.getCurrentId();
    const nom = templateNameInput ? templateNameInput.value.trim() : '';
    if (!nom) { setStatus(I18n.t('status.templateNameRequired'), true); return; }
    const savedId = await Templates.save(id, nom, Editor.getHTML(), getPdfFilenameTemplate(), Editor.getHeaderFooterData());
    Templates.setCurrentId(savedId);
    await refreshTemplateList();
    templateSelect.value = savedId;
    setStatus(I18n.t('status.templateSaved'));
  }

  async function onSaveAs() {
    const nom = prompt(I18n.t('prompt.newTemplateName'));
    if (!nom) return;
    if (templateNameInput) templateNameInput.value = nom;
    Templates.setCurrentId(null);
    await onSave();
  }

  async function onDelete() {
    const id = Templates.getCurrentId();
    if (!id) { setStatus(I18n.t('status.noTemplateSelected'), true); return; }
    if (!confirm(I18n.t('confirm.deleteTemplate'))) return;
    await Templates.remove(id);
    await refreshTemplateList();
    onNew();
    setStatus(I18n.t('status.templateDeleted'));
  }

  async function renderReader(record, recordTableId) {
    const html = Editor.getHTML();
    if (typeof record === 'undefined') record = latestRecord || GristAPI.getCurrentRecord();
    let tableId = recordTableId || GristAPI.getCurrentTableId() || currentTableId;
    if (!record) return;
    if (!tableId) {
      const ctx = await GristAPI.detectCurrentContext();
      if (ctx && ctx.tableId) { currentTableId = ctx.tableId; tableId = ctx.tableId; }
    }
    await ReaderMode.render(html, tableId, record, Editor.getHeaderFooterData());
  }

  // Verrou anti-double-export : PdfExport.pdf-export.js utilise un état de
  // MODULE partagé (footnoteCounter/footnoteEntries, remis à zéro en entrée
  // de chaque export) pour numéroter les notes de bas de page - deux exports
  // lancés en parallèle (double-clic, ou export unitaire pendant qu'un
  // export en lot tourne déjà) partageraient cet état et pourraient corrompre
  // silencieusement la numérotation de l'un des deux (cf. AUDIT_CODE_V2.md
  // §4). Désactive les deux boutons pendant TOUTE opération d'export, pas
  // seulement celui cliqué, tant que ce partage d'état existe côté
  // pdf-export.js.
  let exportOperationInProgress = false;
  // `v2-btn-export-pdf-batch` est un <span> (ligne de menu au survol), pas un
  // <button> - `.disabled` n'a aucun effet dessus (propriété réservée aux
  // contrôles de formulaire) ; `pointer-events`/`opacity` fonctionnent sur
  // n'importe quel élément.
  function setExportControlLocked(el, locked) {
    if (!el) return;
    if ('disabled' in el) el.disabled = locked;
    el.style.pointerEvents = locked ? 'none' : '';
    el.style.opacity = locked ? '.5' : '';
  }
  function withExportLock(fn) {
    return async (...args) => {
      if (exportOperationInProgress) return;
      exportOperationInProgress = true;
      const btnSingle = document.getElementById('btn-export-pdf');
      const btnBatch = document.getElementById('v2-btn-export-pdf-batch');
      setExportControlLocked(btnSingle, true);
      setExportControlLocked(btnBatch, true);
      try {
        await fn(...args);
      } finally {
        exportOperationInProgress = false;
        setExportControlLocked(btnSingle, false);
        setExportControlLocked(btnBatch, false);
      }
    };
  }

  async function onExportPdf() {
    Editor.exitHeaderFooterModeIfActive();
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert(I18n.t('alert.noRecordForExport')); return; }
    setStatus(I18n.t('status.pdfGenerating'));
    try {
      const qualitySelect = document.getElementById('v2-pdf-quality');
      const quality = qualitySelect ? qualitySelect.value : 'native';
      await PdfExport.exportCurrentRecord(Editor.getHTML(), currentTableId || GristAPI.getCurrentTableId(), record, getPdfFilenameTemplate(), quality, Editor.getHeaderFooterData());
      setStatus(I18n.t('status.pdfGenerated'));
    } catch (e) {
      console.error(e);
      setStatus(I18n.t('status.pdfGenerationError'), true);
    }
  }

  // Caractères invalides dans un nom de fichier ZIP/Windows - une valeur de
  // cellule Grist (nom de client, etc.) peut en contenir sans qu'on le
  // maîtrise, contrairement à l'export d'une seule ligne où ce risque existe
  // déjà mais n'avait jamais été signalé (un seul fichier, l'utilisateur
  // renomme si besoin) - ici, N fichiers générés sans supervision, une
  // valeur du type "Dupont/Fils" casserait silencieusement l'arborescence du
  // ZIP si non filtrée.
  function sanitizeFilenamePart(name) {
    return String(name || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
  }

  // Ajoute un suffixe " (2)", " (3)"... si ce nom a déjà été utilisé dans ce
  // lot - deux lignes peuvent tout à fait résoudre au même nom de fichier
  // (gabarit de nom sans variable, ou variable identique sur 2 lignes),
  // sinon la 2e écraserait silencieusement la 1re dans le ZIP.
  function uniqueZipFilename(baseName, usedNames) {
    let name = baseName;
    let n = 2;
    while (usedNames.has(name)) { name = baseName + ' (' + n + ')'; n++; }
    usedNames.add(name);
    return name;
  }

  // Export PDF EN LOT : une ligne Grist de la table courante = un PDF, tous
  // regroupés dans une seule archive ZIP téléchargée (JSZip, chargé via CDN
  // dans v2/index.html) - demandé par l'utilisateur pour ne pas avoir à
  // exporter ligne par ligne. Lit TOUTES les lignes de la table
  // (GristAPI.fetchTableRows, lecture directe docApi - ignore un éventuel
  // filtre de vue posé sur la section Grist du widget, cohérent avec la
  // formulation "toutes les lignes de la table" plutôt que "les lignes
  // actuellement affichées"), pas seulement la ligne sélectionnée.
  // Volontairement limité à la qualité vectorielle (PdfExport.getNativePdfBlobForRecord) :
  // 'Impr. navigateur' ouvrirait une boîte de dialogue d'impression par
  // ligne (inutilisable sans surveillance) et les qualités raster
  // (html2canvas) n'ont pas de variante "retourne un blob" - aucune des deux
  // n'est praticable pour un export non surveillé de N lignes, quel que soit
  // le réglage actuellement choisi dans le sélecteur de qualité.
  async function onExportPdfBatch() {
    Editor.exitHeaderFooterModeIfActive();
    const tableId = currentTableId || GristAPI.getCurrentTableId();
    if (!tableId) { setStatus(I18n.t('status.currentTableNotFound'), true); return; }
    let rows;
    try { rows = await GristAPI.fetchTableRows(tableId); }
    catch (e) {
      console.error('[main] export PDF en lot : échec de lecture de la table', e);
      setStatus(I18n.t('status.cannotReadRows'), true);
      return;
    }
    if (!rows.length) { setStatus(I18n.t('status.noRowsInTable', { table: tableId }), true); return; }
    const proceed = window.confirm(I18n.t('confirm.batchExport', { count: rows.length, table: tableId }));
    if (!proceed) return;

    // JSZip fait partie du même lot de bibliothèques PDF chargées à la
    // demande (cf. v2/js/pdf-export.js:ensurePdfLibsLoaded) - plus chargé
    // d'office au démarrage du widget, donc `JSZip` n'existe pas encore tant
    // que ceci n'a pas été attendu au moins une fois.
    setStatus(I18n.t('status.loadingPdfLibs'));
    try { await PdfExport.ensurePdfLibsLoaded(); }
    catch (e) {
      console.error('[main] export PDF en lot : échec de chargement des bibliothèques PDF', e);
      setStatus(I18n.t('status.pdfLibsLoadError'), true);
      return;
    }

    const html = Editor.getHTML();
    const filenameTemplate = getPdfFilenameTemplate();
    const headerFooterData = Editor.getHeaderFooterData();
    const zip = new JSZip();
    const usedNames = new Set();
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i++) {
      setStatus(I18n.t('status.batchExportProgress', { current: i + 1, total: rows.length }));
      try {
        const { blob, filename } = await PdfExport.getNativePdfBlobForRecord(html, tableId, rows[i], filenameTemplate, headerFooterData);
        const base = sanitizeFilenamePart(filename) || ('document-' + rows[i].id);
        zip.file(uniqueZipFilename(base, usedNames) + '.pdf', blob);
        ok++;
      } catch (e) {
        console.error('[main] export PDF en lot : échec pour la ligne', rows[i].id, e);
        failed++;
      }
    }
    if (!ok) { setStatus(I18n.t('status.exportError'), true); return; }

    setStatus(I18n.t('status.zipCompressing'));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilenamePart(tableId) + '-export-pdf.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(failed
      ? I18n.t('status.batchExportDoneWithFailures', { ok, failed })
      : I18n.t('status.batchExportDone', { ok }));
  }

  async function switchMode(mode) {
    if (mode === 'read') Editor.exitHeaderFooterModeIfActive();
    currentMode = mode;
    btnEdit.classList.toggle('active', mode === 'edit');
    btnRead.classList.toggle('active', mode === 'read');
    editorContainer.style.display = mode === 'edit' ? 'block' : 'none';
    readerContainer.style.display = mode === 'read' ? 'block' : 'none';
    if (mode === 'read') await renderReader(latestRecord || GristAPI.getCurrentRecord(), latestRecordTableId || GristAPI.getCurrentTableId());
  }

  function wireA4PreviewToggle() {
    const toggle = document.getElementById('v2-toggle-a4-preview');
    if (!toggle) return;
    // Posée sur les DEUX conteneurs (édition ET lecture) : la case ne
    // touchait jusqu'ici que #editor-container, donc rester fidèle à la
    // largeur réelle d'une page PDF (cf. commentaire CSS) ne marchait
    // jamais en mode Lecture, quel que soit l'état de la case - signalé
    // cassé par l'utilisateur.
    // .checked sur le <label> lui-même (classe partagée .a4-toggle, cf.
    // css/style.css - même mécanisme que la V1) : fait rester l'icône en
    // accent/bleu tant que la case est cochée, plutôt qu'un simple texte de
    // case à cocher (demandé par l'utilisateur).
    const label = toggle.closest('.a4-toggle');
    const sync = () => {
      editorContainer.classList.toggle('a4-preview', toggle.checked);
      readerContainer.classList.toggle('a4-preview', toggle.checked);
      if (label) label.classList.toggle('checked', toggle.checked);
      Editor.refreshPaginationPreview();
    };
    toggle.addEventListener('change', sync);
    sync();
  }

  // Nom de fichier PDF masqué par défaut derrière un crayon - même geste que
  // le renommage de modèle (wireTemplateRename ci-dessous) : réglage
  // secondaire, pas besoin d'occuper en permanence une zone large de la
  // barre du haut. Reste visible si déjà configuré (cf.
  // loadTemplateIntoEditor) plutôt que de se refermer tout seul.
  function wirePdfFilenameToggle() {
    const btn = document.getElementById('btn-toggle-pdf-filename');
    if (!btn || !pdfFilenameInput) return;
    const close = () => { if (!pdfFilenameInput.value.trim()) pdfFilenameInput.hidden = true; };
    btn.addEventListener('click', () => {
      if (pdfFilenameInput.hidden) { pdfFilenameInput.hidden = false; pdfFilenameInput.focus(); } else close();
    });
    pdfFilenameInput.addEventListener('blur', close);
    pdfFilenameInput.addEventListener('keydown', e => { if (e.key === 'Enter') pdfFilenameInput.blur(); });
  }

  // Qualité PDF : bouton + panneau au survol (même mécanisme que les styles
  // de puce/numérotation de la ligne de mise en forme, cf. v2/js/editor.js)
  // plutôt qu'un <select> toujours affiché - onExportPdf lit encore
  // v2-pdf-quality.value directement, inchangé.
  function wireQualityDropdown() {
    const select = document.getElementById('v2-pdf-quality');
    const flyout = document.getElementById('v2-quality-flyout');
    const trigger = document.getElementById('v2-btn-quality');
    if (!select || !flyout || !trigger) return;
    const rows = flyout.querySelectorAll('.v2-hover-row');
    const syncActiveRow = () => rows.forEach(row => row.classList.toggle('is-active', row.dataset.quality === select.value));
    rows.forEach(row => row.addEventListener('click', () => { select.value = row.dataset.quality; syncActiveRow(); }));
    const group = trigger.closest('.v2-hover-group');
    if (group) group.addEventListener('mouseenter', syncActiveRow);
    syncActiveRow();
  }

  // "Tables liées" (v2/js/variables.js) : modale séparée plutôt que le volet
  // repliable de la V1 (#toolbar-panel) - v2 n'a pas ce volet du tout, une
  // modale évite d'avoir à en introduire un pour ce seul besoin. Rafraîchit
  // la liste à chaque ouverture (une règle a pu être ajoutée entre-temps via
  // l'insertion d'une variable).
  function wireLinkRulesModal() {
    const btn = document.getElementById('btn-link-rules');
    const modal = document.getElementById('link-rules-modal');
    const btnClose = document.getElementById('link-rules-close');
    if (!btn || !modal || !btnClose) return;
    btn.addEventListener('click', () => { Variables.refreshLinkRulesPanel(); modal.style.display = 'flex'; });
    btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
  }

  // Galerie de templates ("Créer à partir d'un template", cf. flyout au
  // survol de #btn-new + v2/js/template-gallery.js pour le catalogue/parsing).
  // Aperçu en lecture seule = simple reconstruction DOM passive (innerHTML
  // dans un conteneur .tiptap, MÊME technique que resolveZone's measureRoot
  // dans pdf-export.js) - pas une seconde instance TipTap, donc aucun risque
  // sur l'état/l'historique du document réellement en cours d'édition.
  function wireTemplateGalleryModal() {
    const openLink = document.getElementById('v2-btn-new-from-template');
    const galleryModal = document.getElementById('template-gallery-modal');
    const galleryClose = document.getElementById('tpl-gallery-close');
    const grid = document.getElementById('tpl-gallery-grid');
    const tagsBar = document.getElementById('tpl-gallery-tags');
    const searchInput = document.getElementById('tpl-gallery-search');
    const previewModal = document.getElementById('template-preview-modal');
    const previewName = document.getElementById('tpl-preview-name');
    const previewTiptap = document.getElementById('tpl-preview-tiptap');
    const previewUseEmpty = document.getElementById('tpl-preview-use-empty');
    const previewUseData = document.getElementById('tpl-preview-use-data');
    const previewBack = document.getElementById('tpl-preview-back');
    const previewCloseBtn = document.getElementById('tpl-preview-close');
    if (!openLink || !galleryModal || !grid || !previewModal) return;

    let manifest = [];
    let activeTag = '';
    let currentEntry = null;
    let currentHtml = '';

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
        const tagsHtml = (entry.tags || []).map(t => `<span>${t}</span>`).join('');
        card.innerHTML = `<img src="${TemplateGallery.resolveUrl(entry.screenshot)}" alt="${entry.name}"><span class="tpl-gallery-card-name">${entry.name}</span><span class="tpl-gallery-card-tags">${tagsHtml}</span>`;
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
          console.error('[main] galerie de templates : échec du chargement du manifeste', e);
          setStatus(I18n.t('status.galleryLoadError'), true);
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
        previewTiptap.innerHTML = currentHtml;
      } catch (e) {
        console.error('[main] galerie de templates : échec du chargement du template', e);
        setStatus(I18n.t('status.templateLoadError'), true);
      }
    }

    function closeAll() {
      galleryModal.style.display = 'none';
      previewModal.style.display = 'none';
    }

    // Charger le template ne suffit pas : sans un Templates.save() explicite,
    // il ne reste qu'un tampon d'édition non enregistré (exactement comme
    // "Modèle vierge"/onNew), invisible dans #template-select tant que
    // l'utilisateur ne clique pas lui-même sur Enregistrer - signalé par
    // l'utilisateur après un test réel ("ça n'a pas créé le modèle... dans sa
    // liste de modèle"), alors que le cahier des charges parlait bien d'un
    // modèle "stocké". Réutilise onSave() tel quel (mêmes garanties déjà en
    // place : lit templateNameInput.value, id courant null ⇒ AddRecord neuf,
    // rafraîchit #template-select et le sélectionne) plutôt que dupliquer
    // l'appel à Templates.save().
    async function useEmpty() {
      if (!currentEntry || !currentHtml) return;
      const html = TemplateGallery.stripVariableBadges(currentHtml);
      templateSelect.value = '';
      loadTemplateIntoEditor({ id: null, contenu: html, headerFooter: null, nom: currentEntry.name, nomFichierPDF: '' });
      await onSave();
      closeAll();
      setStatus(I18n.t('status.templateSavedAsNew', { name: currentEntry.name }));
    }

    async function useWithData() {
      if (!currentEntry || !currentHtml) return;
      let schema;
      try { schema = await TemplateGallery.fetchSchema(currentEntry); }
      catch (e) {
        console.error('[main] galerie de templates : échec du chargement du schéma', e);
        setStatus(I18n.t('status.schemaLoadError'), true);
        return;
      }
      if (!schema || !schema.columns.length) { setStatus(I18n.t('status.noColumnsDefined'), true); return; }
      const defaultName = schema.tableName || currentEntry.name.replace(/[^a-zA-Z0-9_]+/g, '_');
      const tableName = window.prompt(I18n.t('prompt.newTableName'), defaultName);
      if (!tableName) return;
      // Les badges #Variable du HTML statique pointent vers schema.tableName
      // (le nom de classe tel qu'authoré dans schema.py) - si Grist crée la
      // table sous un autre nom (l'utilisateur l'a renommée dans le prompt
      // ci-dessus, ou Grist a dû dédupliquer un nom déjà pris), il faut
      // réaligner ces références AVANT de charger le HTML dans l'éditeur, ou
      // les variables pointeraient vers une table inexistante malgré une
      // vraie table fraîchement créée (cf. TemplateGallery.rebindVariableTable).
      let actualTableId = tableName;
      try {
        const result = await grist.docApi.applyUserActions([['AddTable', tableName, schema.columns]]);
        if (result && result.retValues && result.retValues[0] && result.retValues[0].tableId) {
          actualTableId = result.retValues[0].tableId;
        }
      } catch (e) {
        console.error('[main] galerie de templates : échec de la création de la table', e);
        setStatus(I18n.t('status.tableCreationError', { table: tableName }), true);
        return;
      }
      const html = TemplateGallery.rebindVariableTable(currentHtml, schema.tableName, actualTableId);
      templateSelect.value = '';
      loadTemplateIntoEditor({ id: null, contenu: html, headerFooter: null, nom: currentEntry.name, nomFichierPDF: '' });
      await onSave();
      closeAll();
      setStatus(I18n.t('status.tableCreatedSummary', { table: actualTableId, count: schema.columns.length, name: currentEntry.name }));
    }

    openLink.addEventListener('click', openGallery);
    if (galleryClose) galleryClose.addEventListener('click', closeAll);
    if (previewCloseBtn) previewCloseBtn.addEventListener('click', closeAll);
    if (previewBack) previewBack.addEventListener('click', () => { previewModal.style.display = 'none'; galleryModal.style.display = 'flex'; });
    if (searchInput) searchInput.addEventListener('input', renderGrid);
    previewUseEmpty.addEventListener('click', useEmpty);
    previewUseData.addEventListener('click', useWithData);
  }

  async function init() {
    try { await GristAPI.init(); } catch (e) { setStatus(I18n.t('status.gristApiError'), true); }
    await Editor.init();
    GristAPI.onRecord(async function (record, tableId) {
      latestRecord = record;
      latestRecordTableId = tableId || GristAPI.getCurrentTableId();
      if (tableId) currentTableId = tableId;
      if (currentMode === 'read' && record) await renderReader(record, latestRecordTableId);
    });
    await refreshTemplateList();
    await onTemplateSelectChange();
    templateSelect.addEventListener('change', onTemplateSelectChange);
    document.getElementById('btn-new').addEventListener('click', onNew);
    document.getElementById('btn-save').addEventListener('click', onSave);
    document.getElementById('btn-save-as').addEventListener('click', onSaveAs);
    document.getElementById('btn-delete').addEventListener('click', onDelete);
    document.getElementById('btn-export-pdf').addEventListener('click', withExportLock(onExportPdf));
    document.getElementById('v2-btn-export-pdf-batch').addEventListener('click', withExportLock(onExportPdfBatch));
    btnEdit.addEventListener('click', () => switchMode('edit'));
    btnRead.addEventListener('click', () => switchMode('read'));
    wireA4PreviewToggle();
    wireLinkRulesModal();
    wireTemplateGalleryModal();
    wireTemplateRename();
    wirePdfFilenameToggle();
    wireQualityDropdown();
    Settings.wireSettingsModal();
    Variables.initFilenameInput(pdfFilenameInput);
    await switchMode('edit');
    setStatus(I18n.t('status.ready'));
  }

  init();
})();
