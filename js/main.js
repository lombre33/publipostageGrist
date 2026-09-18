// Orchestration : gestion de modèles + mode Édition/Lecture + export PDF + câblage Grist + modale "Tables liées". `Editor.init()` est async : il charge
// TipTap/ProseMirror via import() dynamique au moment de l'appel.
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
  const conflictBanner = document.getElementById('autosave-conflict-banner');
  const conflictReloadBtn = document.getElementById('autosave-conflict-reload');

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
      opt.textContent = t.estParDefaut ? (t.nom + ' ★') : t.nom;
      templateSelect.appendChild(opt);
    });
  }

  // Reflète si le modèle actuellement chargé est le modèle par défaut - rappelé après chaque changement de modèle et après le clic sur le bouton lui-même,
  // jamais mis à jour "à la main" ailleurs pour ne jamais désynchroniser l'icône de l'état réel.
  function syncDefaultTemplateButton() {
    const btn = document.getElementById('btn-set-default-template');
    if (!btn) return;
    const currentId = Templates.getCurrentId();
    const isDefault = currentId != null && String(Templates.getDefaultId()) === String(currentId);
    btn.classList.toggle('is-default', isDefault);
    btn.disabled = currentId == null;
  }

  function wireDefaultTemplateButton() {
    const btn = document.getElementById('btn-set-default-template');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const currentId = Templates.getCurrentId();
      if (!currentId) return;
      const wasDefault = String(Templates.getDefaultId()) === String(currentId);
      await Templates.setDefault(wasDefault ? null : currentId);
      await refreshTemplateList();
      templateSelect.value = currentId;
      syncDefaultTemplateButton();
      setStatus(wasDefault ? I18n.t('status.defaultTemplateCleared') : I18n.t('status.defaultTemplateSet'));
    });
    syncDefaultTemplateButton();
  }

  function loadTemplateIntoEditor(tpl) {
    closeTemplateRenameEditor();
    // Changer de modèle en pleine édition d'en-tête/pied de page laisserait sinon le contenu d'en-tête chargé à la place du document principal qu'on
    // s'apprête à écraser - même garde que Save/Export/Mode Lecture.
    Editor.exitHeaderFooterModeIfActive();
    // Marges posées AVANT setHTML : les zones 2-colonnes en mode mm calculent --layout-left dès leur toute première construction (par setHTML) à partir
    // de PageLayout.getContentWidthMm() - les poser après aurait rendu une 1ère passe avec les marges du modèle PRÉCÉDENT.
    PageLayout.setMarginsMm(tpl ? tpl.marginsMm : null);
    Editor.setHTML(tpl ? tpl.contenu : '');
    Editor.setHeaderFooterData(tpl ? tpl.headerFooter : null);
    if (templateNameInput) templateNameInput.value = tpl ? tpl.nom : '';
    if (pdfFilenameInput) {
      pdfFilenameInput.value = tpl ? (tpl.nomFichierPDF || '') : '';
      // Reste visible si un nom est déjà configuré - éviter de cacher un réglage actif derrière le crayon (cf. wirePdfFilenameToggle).
      pdfFilenameInput.hidden = !pdfFilenameInput.value.trim();
    }
    Templates.setCurrentId(tpl ? tpl.id : null);
    Comments.loadForTemplate(tpl ? tpl.id : null).catch(e => console.error('[main] chargement des commentaires impossible', e));
    const headingNumberingSelect = document.getElementById('v2-heading-numbering-select');
    if (headingNumberingSelect) headingNumberingSelect.value = Editor.getHeadingNumberingStyle();
    // Changer de modèle ne touchait jusqu'ici que #editor-container (caché en mode Lecture) - #reader-container ne se rafraîchissait donc jamais tant qu'on
    // ne repassait pas explicitement par "Mode édition" puis "Mode lecture" (le changement de modèle semblait alors "ne rien faire" en mode Lecture).
    if (currentMode === 'read') renderReader();
    syncDefaultTemplateButton();
    // DERNIÈRE ligne de cette fonction (pas avant) : Editor.setHTML()/setHeaderFooterData() juste au-dessus déclenchent leurs propres transactions
    // ProseMirror, donc leur propre `editor.on('update')` - sans ça, charger un modèle se marquerait lui-même "modifié" aux yeux de l'auto-save.
    resetAutosaveState(tpl);
  }

  // Le select choisit/affiche le modèle courant, le crayon fait apparaître l'input à sa place pour le renommer. Le renommage ne touche que l'affichage local
  // : la persistance reste au prochain clic sur Enregistrer.
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
    let savedId, dateModif;
    try {
      ({ id: savedId, dateModif } = await Templates.save(id, nom, Editor.getHTML(), getPdfFilenameTemplate(), Editor.getHeaderFooterData(), PageLayout.getMarginsMm()));
    } catch (e) {
      // Avant ce try/catch, un échec ici (ex. colonne Grist manquante) interrompait silencieusement la fonction : aucune erreur visible, la liste des
      // modèles/le statut n'étaient jamais mis à jour, et rien dans l'interface ne laissait deviner que "Enregistrer" n'avait rien enregistré.
      console.error('[main] échec de l’enregistrement manuel', e);
      setStatus(I18n.t('status.saveError'), true);
      return;
    }
    Templates.setCurrentId(savedId);
    await refreshTemplateList();
    templateSelect.value = savedId;
    syncDefaultTemplateButton();
    // Premier enregistrement d'un modèle tout neuf : Comments n'a encore JAMAIS reçu d'id de modèle (loadForTemplate n'est appelé que par
    // loadTemplateIntoEditor, qui ne repasse pas par ici). Sans ceci, "Commenter la sélection" répondait "Enregistrez d'abord le modèle" à quelqu'un qui
    // venait précisément de l'enregistrer, jusqu'à ce qu'il change de modèle et revienne. Uniquement quand l'id CHANGE : un ré-enregistrement du même
    // modèle n'a rien à recharger, et loadForTemplate referme le popup ouvert.
    if (String(id) !== String(savedId)) {
      Comments.loadForTemplate(savedId).catch(e => console.error('[main] chargement des commentaires impossible après création du modèle', e));
    }
    // Un enregistrement manuel explicite tranche tout conflit auto-save en cours en faveur de CETTE version (cf. autosaveTick) - pas besoin de recharger.
    autosaveDirty = false;
    autosaveLastKnownDateModif = dateModif;
    hideConflictBanner();
    updateSaveStatus();
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

  // === Auto-save (V1) ===
  // Enregistre automatiquement le modèle en cours toutes les AUTOSAVE_INTERVAL_MS, mais SEULEMENT s'il y a eu une modification depuis le dernier
  // enregistrement (autosaveDirty) ET qu'un modèle existant est déjà chargé (jamais de création automatique - un modèle tout juste créé doit toujours
  // passer par un premier Enregistrer manuel, cf. onSave). Objectif : réduire la fenêtre de perte en cas de fermeture inattendue, PAS remplacer
  // Enregistrer - et réduire la fenêtre de collision si quelqu'un d'autre modifie le même modèle en même temps (moins de temps sans écrire = moins de
  // chances qu'un écrasement silencieux couvre beaucoup de travail).
  //
  // Détection de conflit : à chaque vérification, on compare le DateModif réellement présent dans Grist à celui qu'on a nous-mêmes écrit en dernier
  // (autosaveLastKnownDateModif). Un écart révèle qu'une autre personne (ou un autre onglet) a enregistré ce même modèle entre-temps - l'auto-save se
  // gèle alors (n'écrase plus rien tout seul) et affiche un bandeau proposant de recharger. Un Enregistrer MANUEL reste toujours possible pendant ce
  // temps et tranche explicitement en faveur de la version locale (cf. onSave) - un choix conscient de l'utilisateur, jamais fait à sa place.
  const AUTOSAVE_INTERVAL_MS = 2500;
  // Préférence PAR NAVIGATEUR (comme la touche de déclenchement #Variable, cf. js/settings.js), pas par document Grist : chacun choisit s'il veut de
  // l'auto-save, indépendamment des autres personnes qui ouvrent le même widget.
  const AUTOSAVE_ENABLED_STORAGE = 'pp_autosave_enabled';
  let autosaveDirty = false;
  let autosaveLastKnownDateModif = null;
  let autosaveConflictActive = false;
  let autosaveConflictTpl = null;
  let autosaveTimer = null;

  function isAutosaveEnabled() {
    try { return localStorage.getItem(AUTOSAVE_ENABLED_STORAGE) !== 'false'; } // absent = activé par défaut
    catch (e) { return true; } // stockage indisponible (navigation privée, quota) : on se comporte comme si c'était activé plutôt que de le figer désactivé
  }

  function setAutosaveEnabled(enabled) {
    try { localStorage.setItem(AUTOSAVE_ENABLED_STORAGE, enabled ? 'true' : 'false'); } catch (e) { /* choix non persisté, reste actif pour cette session */ }
  }

  function markAutosaveDirty() { autosaveDirty = true; updateSaveStatus(); }

  function resetAutosaveState(tpl) {
    autosaveDirty = false;
    autosaveLastKnownDateModif = tpl ? tpl.dateModif : null;
    hideConflictBanner();
    updateSaveStatus();
  }

  // Coin "info" de la barre d'outils (#status-msg, setStatus) - avant ceci, il affichait simplement le dernier message quel qu'il soit ("Modèle
  // enregistré.", "PDF généré.", une erreur...) et le gardait affiché indéfiniment, y compris après de nouvelles frappes JAMAIS enregistrées : rien
  // n'indiquait que ce message était devenu faux. Appelée après CHAQUE frappe (markAutosaveDirty) et après chaque sauvegarde/rechargement, elle fait
  // dire au coin "info" la vérité sur l'état ACTUEL plutôt que sur le dernier événement : "Enregistré à HH:MM" seulement quand tout ce qui a été tapé
  // est bien en base, rien sinon (brouillon jamais enregistré, frappe en attente, conflit non résolu).
  function updateSaveStatus() {
    if (!Templates.getCurrentId() || !autosaveLastKnownDateModif) { setStatus(''); return; }
    if (autosaveDirty || autosaveConflictActive) { setStatus(''); return; }
    setStatus(I18n.t('status.savedAt', { time: formatSaveTime(autosaveLastKnownDateModif) }));
  }

  function formatSaveTime(iso) {
    try { return new Date(iso).toLocaleTimeString(I18n.getLang() === 'en' ? 'en-US' : 'fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch (e) { return ''; }
  }

  function showConflictBanner(remoteTpl) {
    autosaveConflictActive = true;
    autosaveConflictTpl = remoteTpl;
    if (conflictBanner) conflictBanner.style.display = '';
  }

  function hideConflictBanner() {
    autosaveConflictActive = false;
    autosaveConflictTpl = null;
    if (conflictBanner) conflictBanner.style.display = 'none';
  }

  async function autosaveTick() {
    if (!isAutosaveEnabled()) return; // désactivé par l'utilisateur (cf. v2-toggle-autosave) - aucun appel Grist tant que c'est le cas, pas seulement le
    // dernier enregistrement sauté : ni le polling de conflit ni l'écriture elle-même ne doivent tourner en arrière-plan pendant que c'est éteint.
    if (exportOperationInProgress) return; // évite toute contention Grist avec un export en cours
    if (autosaveConflictActive) return; // gelé tant que l'utilisateur n'a pas choisi (recharger, ou Enregistrer manuellement pour garder sa version)
    const id = Templates.getCurrentId();
    if (!id) return; // aucune ligne à mettre à jour - jamais de création automatique
    let fresh;
    try { fresh = await Templates.loadAll(); }
    catch (e) { console.error('[main] auto-save : vérification de conflit impossible', e); return; }
    const remoteTpl = fresh.find(t => String(t.id) === String(id));
    if (remoteTpl && autosaveLastKnownDateModif && remoteTpl.dateModif && remoteTpl.dateModif !== autosaveLastKnownDateModif) {
      showConflictBanner(remoteTpl);
      return;
    }
    if (!autosaveDirty) return;
    // getHTML() renverrait le fragment en-tête/pied actuellement chargé, pas le document principal (cf. header-footer-preview.js) - on saute ce tick
    // plutôt que de forcer une sortie de ce mode toutes les ~2-3s (bien plus perturbant que d'attendre le tick suivant).
    if (Editor.isEditingHeaderFooter()) return;
    const nom = templateNameInput ? templateNameInput.value.trim() : '';
    if (!nom) return; // même garde que le bouton Enregistrer manuel
    try {
      const { dateModif } = await Templates.save(id, nom, Editor.getHTML(), getPdfFilenameTemplate(), Editor.getHeaderFooterData(), PageLayout.getMarginsMm());
      autosaveLastKnownDateModif = dateModif;
      autosaveDirty = false;
      updateSaveStatus();
    } catch (e) {
      console.error('[main] auto-save : échec d’enregistrement', e);
      // autosaveDirty reste true - retenté au prochain tick. Affiché (pas seulement loggé) : un échec RÉPÉTÉ doit se voir dans le coin "info" plutôt que
      // de laisser croire, en silence, que tout est enregistré alors que ça ne l'est plus depuis ce tick.
      setStatus(I18n.t('status.autosaveError'), true);
    }
  }

  function startAutosaveLoop() {
    if (autosaveTimer) return;
    autosaveTimer = setInterval(autosaveTick, AUTOSAVE_INTERVAL_MS);
  }

  // Bouton bascule (v2-toggle-autosave, façon v2-toggle-a4-preview) : la boucle setInterval tourne TOUJOURS une fois démarrée, seul autosaveTick()
  // vérifie isAutosaveEnabled() en tout premier - décocher n'arrête donc pas un minuteur qu'il faudrait recréer à la réactivation, ça fait juste sauter
  // le prochain tick, à un coût négligeable (une lecture localStorage toutes les 2.5s).
  function wireAutosaveToggle() {
    const toggle = document.getElementById('v2-toggle-autosave');
    const label = toggle ? toggle.closest('.autosave-toggle') : null;
    if (!toggle) return;
    toggle.checked = isAutosaveEnabled();
    if (label) label.classList.toggle('checked', toggle.checked);
    toggle.addEventListener('change', () => {
      setAutosaveEnabled(toggle.checked);
      if (label) label.classList.toggle('checked', toggle.checked);
      setStatus(I18n.t(toggle.checked ? 'status.autosaveEnabled' : 'status.autosaveDisabled'));
      // Réactiver doit se comporter comme si on n'avait jamais coupé : un tick imminent ne doit pas croire qu'un DateModif jamais vérifié pendant la
      // coupure est un conflit. resetAutosaveState() re-synchronise sur le modèle courant, exactement comme au chargement d'un modèle.
      if (toggle.checked) resetAutosaveState(Templates.getCached().find(t => String(t.id) === String(Templates.getCurrentId())));
    });
  }

  function wireAutosaveConflictBanner() {
    if (!conflictReloadBtn) return;
    conflictReloadBtn.addEventListener('click', () => {
      if (!autosaveConflictTpl) return;
      const tpl = autosaveConflictTpl;
      loadTemplateIntoEditor(tpl);
      refreshTemplateList();
      setStatus(I18n.t('status.autosaveConflictReloaded'));
    });
  }

  async function renderReader(record, recordTableId) {
    const html = Editor.getHTML();
    if (typeof record === 'undefined') record = latestRecord || GristAPI.getCurrentRecord();
    let tableId = recordTableId || GristAPI.getCurrentTableId() || currentTableId;
    // Sans ligne sélectionnée, on délègue quand même à ReaderMode.render() pour qu'il affiche son état vide. Avant, ce `return` sec laissait
    // #reader-container littéralement vide : écran blanc sans explication, et le message prévu dans reader-mode.js était du code mort.
    // Tous les appelants de renderReader() sont déjà conditionnés à currentMode === 'read', donc pas de rendu parasite en mode Édition.
    if (!record) { await ReaderMode.render(Editor.getHTML(), tableId, null, Editor.getHeaderFooterData()); return; }
    if (!tableId) {
      const ctx = await GristAPI.detectCurrentContext();
      if (ctx && ctx.tableId) { currentTableId = ctx.tableId; tableId = ctx.tableId; }
    }
    await ReaderMode.render(html, tableId, record, Editor.getHeaderFooterData());
  }

  // Verrou anti-double-export : pdf-export.js utilise un état de module partagé pour numéroter les notes de bas de page - deux exports en parallèle
  // corromperaient silencieusement la numérotation (cf. AUDIT_CODE.md §4). Désactive les deux boutons pendant toute opération, pas seulement celui cliqué.
  let exportOperationInProgress = false;
  // `v2-btn-export-pdf-batch` est un <span> (ligne de menu au survol), pas un <button> - `.disabled` n'a aucun effet dessus (propriété réservée aux contrôles
  // de formulaire) ; `pointer-events`/`opacity` fonctionnent sur n'importe quel élément.
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
      const btnDocx = document.getElementById('v2-btn-export-docx');
      const btnDocxBatch = document.getElementById('v2-btn-export-docx-batch');
      setExportControlLocked(btnSingle, true);
      setExportControlLocked(btnBatch, true);
      setExportControlLocked(btnDocx, true);
      setExportControlLocked(btnDocxBatch, true);
      try {
        await fn(...args);
      } finally {
        exportOperationInProgress = false;
        setExportControlLocked(btnSingle, false);
        setExportControlLocked(btnBatch, false);
        setExportControlLocked(btnDocx, false);
        setExportControlLocked(btnDocxBatch, false);
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
      await PdfExport.exportCurrentRecord(Editor.getHTML(), currentTableId || GristAPI.getCurrentTableId(), record, getPdfFilenameTemplate(), quality, Editor.getHeaderFooterData(), PageLayout.getMarginsPt());
      setStatus(I18n.t('status.pdfGenerated'));
    } catch (e) {
      console.error(e);
      setStatus(I18n.t('status.pdfGenerationError'), true);
    }
  }

  // V1 - portée volontairement plus modeste que le PDF (cf. en-tête js/docx-export.js) : pas de sélecteur de qualité, un seul mode d'export.
  async function onExportDocx() {
    Editor.exitHeaderFooterModeIfActive();
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert(I18n.t('alert.noRecordForExport')); return; }
    setStatus(I18n.t('status.docxGenerating'));
    try {
      await DocxExport.exportCurrentRecord(Editor.getHTML(), currentTableId || GristAPI.getCurrentTableId(), record, getPdfFilenameTemplate(), Editor.getHeaderFooterData(), PageLayout.getMarginsTwip());
      setStatus(I18n.t('status.docxGenerated'));
    } catch (e) {
      console.error(e);
      setStatus(I18n.t('status.docxGenerationError'), true);
    }
  }

  // Caractères invalides dans un nom de fichier ZIP/Windows - une valeur de cellule Grist du type "Dupont/Fils" casserait silencieusement l'arborescence du
  // ZIP si non filtrée.
  function sanitizeFilenamePart(name) {
    return String(name || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
  }

  // Ajoute un suffixe " (2)", " (3)"... si ce nom a déjà été utilisé dans ce lot - deux lignes peuvent tout à fait résoudre au même nom de fichier (gabarit
  // de nom sans variable, ou variable identique sur 2 lignes), sinon la 2e écraserait silencieusement la 1re dans le ZIP.
  function uniqueZipFilename(baseName, usedNames) {
    let name = baseName;
    let n = 2;
    while (usedNames.has(name)) { name = baseName + ' (' + n + ')'; n++; }
    usedNames.add(name);
    return name;
  }

  // Export en lot : une ligne = un PDF, regroupés en ZIP. Lit toutes les lignes via docApi (ignore un filtre de vue). Limité au vectoriel : 'Impr.
  // navigateur' ouvrirait une boîte de dialogue par ligne, et les qualités raster n'ont pas de variante "retourne un blob".
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

    // JSZip fait partie du même lot de bibliothèques PDF chargées à la demande (cf. js/pdf-export.js:ensurePdfLibsLoaded) - plus chargé d'office au démarrage
    // du widget, donc `JSZip` n'existe pas encore tant que ceci n'a pas été attendu au moins une fois.
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
    const marginsPt = PageLayout.getMarginsPt();
    const zip = new JSZip();
    const usedNames = new Set();
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i++) {
      setStatus(I18n.t('status.batchExportProgress', { current: i + 1, total: rows.length }));
      try {
        const { blob, filename } = await PdfExport.getNativePdfBlobForRecord(html, tableId, rows[i], filenameTemplate, headerFooterData, marginsPt);
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

  // Même schéma que onExportPdfBatch - réutilise JSZip via PdfExport.ensurePdfLibsLoaded (docx-export.js n'embarque pas sa propre déclaration CDN/SRI
  // pour cette lib déjà chargée ailleurs, cf. commentaire équivalent en tête de ce fichier pour le PDF).
  async function onExportDocxBatch() {
    Editor.exitHeaderFooterModeIfActive();
    const tableId = currentTableId || GristAPI.getCurrentTableId();
    if (!tableId) { setStatus(I18n.t('status.currentTableNotFound'), true); return; }
    let rows;
    try { rows = await GristAPI.fetchTableRows(tableId); }
    catch (e) {
      console.error('[main] export DOCX en lot : échec de lecture de la table', e);
      setStatus(I18n.t('status.cannotReadRows'), true);
      return;
    }
    if (!rows.length) { setStatus(I18n.t('status.noRowsInTable', { table: tableId }), true); return; }
    const proceed = window.confirm(I18n.t('confirm.batchExport', { count: rows.length, table: tableId }));
    if (!proceed) return;

    setStatus(I18n.t('status.loadingPdfLibs'));
    try { await PdfExport.ensurePdfLibsLoaded(); }
    catch (e) {
      console.error('[main] export DOCX en lot : échec de chargement de JSZip', e);
      setStatus(I18n.t('status.pdfLibsLoadError'), true);
      return;
    }

    const html = Editor.getHTML();
    const filenameTemplate = getPdfFilenameTemplate();
    const headerFooterData = Editor.getHeaderFooterData();
    const marginsTwip = PageLayout.getMarginsTwip();
    const zip = new JSZip();
    const usedNames = new Set();
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i++) {
      setStatus(I18n.t('status.batchExportProgress', { current: i + 1, total: rows.length }));
      try {
        const { blob, filename } = await DocxExport.getDocxBlobForRecord(html, tableId, rows[i], filenameTemplate, headerFooterData, marginsTwip);
        const base = sanitizeFilenamePart(filename) || ('document-' + rows[i].id);
        zip.file(uniqueZipFilename(base, usedNames) + '.docx', blob);
        ok++;
      } catch (e) {
        console.error('[main] export DOCX en lot : échec pour la ligne', rows[i].id, e);
        failed++;
      }
    }
    if (!ok) { setStatus(I18n.t('status.exportError'), true); return; }

    setStatus(I18n.t('status.zipCompressing'));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilenamePart(tableId) + '-export-docx.zip';
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
    // Posée sur les deux conteneurs (édition et lecture), sinon la largeur réelle d'une page PDF ne s'appliquait jamais en mode Lecture. .checked sur le
    // <label> lui-même fait rester l'icône en accent/bleu tant que la case est cochée, plutôt qu'un simple texte de case à cocher.
    const label = toggle.closest('.a4-toggle');
    const sync = () => {
      editorContainer.classList.toggle('a4-preview', toggle.checked);
      readerContainer.classList.toggle('a4-preview', toggle.checked);
      if (label) label.classList.toggle('checked', toggle.checked);
      // Le facteur d'ajustement n'a de sens qu'en Aperçu A4 : applyPageFitZoom le retire de lui-même quand la classe disparaît. Avant la pagination,
      // qui mesure le rendu réel et serait sinon calculée avec l'ancien facteur.
      refreshPageFitZoom();
      Editor.refreshPaginationPreview();
    };
    toggle.addEventListener('change', sync);
    sync();
  }

  // Nom de fichier PDF masqué par défaut derrière un crayon : réglage secondaire, pas besoin d'occuper en permanence une zone de la barre du haut. Reste
  // visible si déjà configuré (cf. loadTemplateIntoEditor).
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

  // Qualité PDF : bouton + panneau au survol plutôt qu'un <select> toujours affiché - onExportPdf lit encore v2-pdf-quality.value directement, inchangé.
  function wireQualityDropdown() {
    const select = document.getElementById('v2-pdf-quality');
    const flyout = document.getElementById('v2-quality-flyout');
    const trigger = document.getElementById('v2-btn-quality');
    if (!select || !flyout || !trigger) return;
    const rows = flyout.querySelectorAll('.v2-hover-row[data-quality]');
    const syncActiveRow = () => rows.forEach(row => row.classList.toggle('is-active', row.dataset.quality === select.value));
    rows.forEach(row => {
      if (row.classList.contains('v2-hover-row-disabled')) return;
      row.addEventListener('click', () => { select.value = row.dataset.quality; syncActiveRow(); });
    });
    const group = trigger.closest('.v2-hover-group');
    if (group) group.addEventListener('mouseenter', syncActiveRow);
    syncActiveRow();
  }

  // Ajustement automatique de la page à la largeur disponible (cf. la règle `zoom` de css/editor-v2.css). Réduit la feuille juste ce qu'il faut pour
  // qu'elle tienne dans le conteneur, jamais au-delà de 1 (une page A4 n'a pas à grossir sur un grand écran) et jamais en dessous de MIN_FIT_ZOOM, sous
  // lequel le texte deviendrait illisible - le défilement horizontal reprend alors la main, comme avant. Aucun contrôle ajouté dans la barre d'outils :
  // quand la feuille tient déjà, le facteur vaut 1 et rien ne change.
  const A4_SHEET_WIDTH_PX = 793.71; // même valeur que .v2-page-sheet / .reader-content en Aperçu A4 (css/editor-v2.css)
  const MIN_FIT_ZOOM = 0.5;
  function applyPageFitZoom(container) {
    if (!container) return;
    if (!container.classList.contains('a4-preview')) { container.style.removeProperty('--pp-fit-zoom'); return; }
    // clientWidth exclut déjà la barre de défilement verticale ; le padding du conteneur, lui, encadre la feuille et doit être retiré à la main.
    const cs = getComputedStyle(container);
    const available = container.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    if (!(available > 0)) return;
    const raw = available / A4_SHEET_WIDTH_PX;
    const zoom = raw >= 1 ? 1 : Math.max(MIN_FIT_ZOOM, raw);
    // Arrondi au millième : sans ça, un redimensionnement continu réécrit la variable à chaque pixel et relance la pagination en boucle.
    const next = String(Math.round(zoom * 1000) / 1000);
    if (container.style.getPropertyValue('--pp-fit-zoom') === next) return;
    container.style.setProperty('--pp-fit-zoom', next);
    return true;
  }

  function refreshPageFitZoom() {
    const editorChanged = applyPageFitZoom(editorContainer);
    const readerChanged = applyPageFitZoom(readerContainer);
    // Les bandes de pagination sont positionnées à partir de mesures réelles : un changement de facteur les rend caduques tant qu'on n'a pas recalculé.
    if (editorChanged && currentMode === 'edit') Editor.refreshPaginationPreview();
    if (readerChanged && currentMode === 'read') renderReader();
  }

  function wirePageFitZoom() {
    refreshPageFitZoom();
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => refreshPageFitZoom());
      if (editorContainer) ro.observe(editorContainer);
      if (readerContainer) ro.observe(readerContainer);
    } else {
      window.addEventListener('resize', refreshPageFitZoom);
    }
  }

  // Raccourci clavier Ctrl+S / Cmd+S : enregistre le modèle courant, exactement comme le bouton Enregistrer (même onSave(), donc mêmes contrôles - nom
  // obligatoire, sortie du mode en-tête/pied). Posé en capture sur `document` pour marcher où que soit le focus (éditeur TipTap, champ de nom, aperçu de
  // template), et preventDefault() est indispensable : sans lui le navigateur ouvre sa propre boîte « Enregistrer la page », y compris dans l'iframe du
  // widget Grist. Neutralisé pendant qu'une modale est ouverte : Ctrl+S y enregistrerait un modèle que l'utilisateur est justement en train de remplacer.
  // Volontairement le SEUL raccourci applicatif ajouté ici - le reste du périmètre clavier est encore à cadrer.
  function wireSaveShortcut() {
    const anyModalOpen = () => Array.prototype.some.call(
      document.querySelectorAll('#link-rules-modal, #link-config-modal, #template-gallery-modal, #template-preview-modal, #settings-modal'),
      m => m.style.display && m.style.display !== 'none');
    document.addEventListener('keydown', (event) => {
      if (event.key !== 's' && event.key !== 'S') return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (anyModalOpen()) return;
      event.preventDefault();
      onSave();
    }, true);
  }

  // Le libellé du raccourci dépend de la plateforme (⌘S sur macOS, Ctrl+S ailleurs) : impossible à écrire dans index.html, posé ici sur l'infobulle et
  // l'aria-label du bouton Enregistrer. Re-appliqué à chaque changement de langue, sinon I18n.applyTranslations() le réécrirait sans le raccourci.
  function decorateSaveButtonShortcut() {
    const btn = document.getElementById('btn-save');
    if (!btn) return;
    const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
    const label = `${I18n.t('toolbar.save')} (${isMac ? '⌘S' : 'Ctrl+S'})`;
    btn.setAttribute('data-tip', label);
    btn.setAttribute('aria-label', label);
  }

  // Accessibilité RGAA des 5 modales du projet : role/aria-modal statiques, piège de focus (Tab/Shift+Tab), Échap, restauration du focus au ferme - générique
  // via MutationObserver sur leur propre style.display plutôt que de toucher chaque site d'ouverture/fermeture existant (zéro risque sur leur logique).
  function wireModalAccessibility() {
    const MODALS = [
      { id: 'link-rules-modal', closeId: 'link-rules-close' },
      { id: 'link-config-modal', closeId: 'link-config-cancel' },
      { id: 'template-gallery-modal', closeId: 'tpl-gallery-close' },
      { id: 'template-preview-modal', closeId: 'tpl-preview-close' },
      { id: 'settings-modal', closeId: 'settings-close' },
    ];
    MODALS.forEach(({ id, closeId }) => {
      const modal = document.getElementById(id);
      const closeBtn = document.getElementById(closeId);
      if (!modal) return;
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      let restoreFocusTo = null;
      const focusablesIn = () => Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]'))
        .filter(el => !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null);
      new MutationObserver(() => {
        const isOpen = getComputedStyle(modal).display !== 'none';
        if (isOpen && !restoreFocusTo) {
          restoreFocusTo = document.activeElement;
          (focusablesIn()[0] || modal).focus();
        } else if (!isOpen && restoreFocusTo) {
          const toFocus = restoreFocusTo;
          restoreFocusTo = null;
          if (toFocus && document.contains(toFocus)) toFocus.focus();
        }
      }).observe(modal, { attributes: true, attributeFilter: ['style'] });
      modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.preventDefault(); if (closeBtn) closeBtn.click(); return; }
        if (event.key !== 'Tab') return;
        const focusables = focusablesIn();
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
    });
  }

  // "Tables liées" (js/variables.js) : modale séparée, rafraîchit la liste à chaque ouverture (une règle a pu être ajoutée entre-temps via l'insertion d'une
  // variable).
  function wireLinkRulesModal() {
    const btn = document.getElementById('btn-link-rules');
    const modal = document.getElementById('link-rules-modal');
    const btnClose = document.getElementById('link-rules-close');
    if (!btn || !modal || !btnClose) return;
    btn.addEventListener('click', () => { Variables.refreshLinkRulesPanel(); modal.style.display = 'flex'; });
    btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
  }

  // Galerie de templates : aperçu en lecture seule = simple reconstruction DOM passive (innerHTML dans un conteneur .tiptap), pas une seconde instance
  // TipTap, donc aucun risque sur le document réellement en cours d'édition.
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
        card.innerHTML = `<img src="${TemplateGallery.resolveUrl(entry.screenshot, entry)}" alt="${entry.name}"><span class="tpl-gallery-card-name">${entry.name}</span><span class="tpl-gallery-card-tags">${tagsHtml}</span>`;
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

    // Charger le template ne suffit pas : sans un Templates.save() explicite, il ne reste qu'un tampon d'édition non enregistré, invisible dans
    // #template-select. Réutilise onSave() tel quel plutôt que dupliquer l'appel à Templates.save().
    async function useEmpty() {
      if (!currentEntry || !currentHtml) return;
      const html = TemplateGallery.stripVariableBadges(currentHtml);
      const headerFooter = await TemplateGallery.fetchHeaderFooter(currentEntry);
      templateSelect.value = '';
      loadTemplateIntoEditor({ id: null, contenu: html, headerFooter, nom: currentEntry.name, nomFichierPDF: '' });
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
      // Les badges #Variable du HTML statique pointent vers schema.tableName - si Grist crée la table sous un autre nom (renommée dans le prompt, ou
      // dédupliquée), il faut réaligner ces références avant de charger le HTML, ou les variables pointeraient vers une table inexistante.
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
      const headerFooter = await TemplateGallery.fetchHeaderFooter(currentEntry);
      templateSelect.value = '';
      loadTemplateIntoEditor({ id: null, contenu: html, headerFooter, nom: currentEntry.name, nomFichierPDF: '' });
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
    // 'update' (pas 'transaction') : ne fire que si le DOCUMENT a réellement changé (docChanged), jamais pour un simple déplacement de curseur/sélection -
    // cf. section "Auto-save" plus haut. Couvre aussi l'édition en-tête/pied (même instance d'éditeur, contenu échangé via setContent).
    EditorCore.getEditor().on('update', markAutosaveDirty);
    if (templateNameInput) templateNameInput.addEventListener('input', markAutosaveDirty);
    if (pdfFilenameInput) pdfFilenameInput.addEventListener('input', markAutosaveDirty);
    // Émis par js/settings.js à chaque saisie dans les 4 champs de marge (onglet Réglages) - sans lui, changer uniquement les marges sans toucher au
    // texte ne marquait jamais le brouillon "modifié" et l'auto-save ne l'enregistrait donc jamais.
    document.addEventListener('pp:marginsChanged', markAutosaveDirty);
    GristAPI.onRecord(async function (record, tableId) {
      latestRecord = record;
      latestRecordTableId = tableId || GristAPI.getCurrentTableId();
      if (tableId) currentTableId = tableId;
      if (currentMode === 'read' && record) await renderReader(record, latestRecordTableId);
    });
    await refreshTemplateList();
    // Modèle par défaut (cf. btn-set-default-template) : sélectionné avant la lecture de templateSelect.value ci-dessous, pour que le widget s'ouvre
    // directement dessus plutôt que sur "-- Nouveau modèle --". Silencieux si l'id ne correspond à aucune option (modèle supprimé entre-temps).
    const defaultTemplateId = Templates.getDefaultId();
    if (defaultTemplateId != null) templateSelect.value = defaultTemplateId;
    await onTemplateSelectChange();
    templateSelect.addEventListener('change', onTemplateSelectChange);
    document.getElementById('btn-new').addEventListener('click', onNew);
    document.getElementById('btn-save').addEventListener('click', onSave);
    document.getElementById('btn-save-as').addEventListener('click', onSaveAs);
    document.getElementById('btn-delete').addEventListener('click', onDelete);
    document.getElementById('btn-export-pdf').addEventListener('click', withExportLock(onExportPdf));
    document.getElementById('v2-btn-export-pdf-batch').addEventListener('click', withExportLock(onExportPdfBatch));
    document.getElementById('v2-btn-export-docx').addEventListener('click', withExportLock(onExportDocx));
    document.getElementById('v2-btn-export-docx-batch').addEventListener('click', withExportLock(onExportDocxBatch));
    btnEdit.addEventListener('click', () => switchMode('edit'));
    btnRead.addEventListener('click', () => switchMode('read'));
    wireA4PreviewToggle();
    wireLinkRulesModal();
    wireTemplateGalleryModal();
    wireTemplateRename();
    wireDefaultTemplateButton();
    wirePdfFilenameToggle();
    wireQualityDropdown();
    Settings.wireSettingsModal();
    wireModalAccessibility();
    wireSaveShortcut();
    wirePageFitZoom();
    decorateSaveButtonShortcut();
    I18n.onChange(decorateSaveButtonShortcut);
    Variables.initFilenameInput(pdfFilenameInput);
    wireAutosaveConflictBanner();
    wireAutosaveToggle();
    startAutosaveLoop();
    await switchMode('edit');
    setStatus(I18n.t('status.ready'));
  }

  init();
})();
