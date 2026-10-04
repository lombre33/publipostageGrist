// Orchestration du widget : modèles, modes Édition et Lecture, exports, câblage de Grist. `Editor.init()` est asynchrone : il charge TipTap et
// ProseMirror par import() dynamique.
(function () {
  let currentMode = 'edit';
  let currentTableId = null;
  let latestRecord = null;
  let latestRecordTableId = null;
  // Type du modèle à l'écran (planning/feature-email-mode.md) : « document » par défaut, avant même le premier chargement ; il ne devient « email »
  // que par un modèle de ce type ou « Nouvel email ».
  let currentTypeModele = 'document';
  // Le macro-modèle d'où le modèle à l'écran a été ouvert par le stylo de son résumé, et ce modèle : { macroId, templateId }, null sinon (cf.
  // openTemplateFromMacro).
  let macroOrigin = null;
  // Valeurs brutes (gabarits #Variable) des quatre champs, capturées juste avant de passer en Lecture : la Lecture affiche les valeurs résolues dans
  // les mêmes <input>, sans zone en double. Non nul seulement pendant la Lecture (cf. updateEmailFieldsDisplay).
  let emailFieldsRawCache = null;

  const statusMsg = document.getElementById('status-msg');
  const templateSelect = document.getElementById('template-select');
  const templateNameInput = document.getElementById('template-name');
  const pdfFilenameInput = document.getElementById('pdf-filename-template');
  const editorContainer = document.getElementById('editor-container');
  const readerContainer = document.getElementById('reader-container');
  const macroSummaryContainer = document.getElementById('macro-summary-container');
  const btnEdit = document.getElementById('btn-mode-edit');
  const btnRead = document.getElementById('btn-mode-read');
  const conflictBanner = document.getElementById('autosave-conflict-banner');
  const conflictReloadBtn = document.getElementById('autosave-conflict-reload');
  const macroReturnBar = document.getElementById('macro-return-bar');
  const emailFieldsRow = document.getElementById('v2-email-fields-row');
  const emailSubjectInput = document.getElementById('v2-email-subject');
  const emailToInput = document.getElementById('v2-email-to');
  const emailCcInput = document.getElementById('v2-email-cc');
  const emailCciInput = document.getElementById('v2-email-cci');
  const emailCciToggle = document.getElementById('v2-btn-toggle-cci');
  const btnCreateEmail = document.getElementById('btn-create-email');
  const emailCharCounter = document.getElementById('v2-email-char-counter');

  // Résout Objet, À, Cc et Cci pour une ligne. Partagé par l'affichage en Lecture et par buildMailtoForRecord (jauge de longueur et création de
  // l'email), pour que ces résolutions ne divergent pas.
  async function resolveEmailFieldsForRecord(rawFields, tableId, record) {
    const [objet, destinataires, cc, cci] = await Promise.all([
      Variables.resolveTextVariables(rawFields.objet, tableId, record),
      Variables.resolveTextVariables(rawFields.destinataires, tableId, record),
      Variables.resolveTextVariables(rawFields.cc, tableId, record),
      Variables.resolveTextVariables(rawFields.cci, tableId, record),
    ]);
    return { objet, destinataires, cc, cci };
  }

  // Les quatre champs de l'email : leur clé, la même dans les réglages du modèle et dans les valeurs résolues, et leur <input>.
  const EMAIL_FIELDS = [['objet', emailSubjectInput], ['destinataires', emailToInput], ['cc', emailCcInput], ['cci', emailCciInput]];
  const eachEmailInput = fn => EMAIL_FIELDS.forEach(([key, input]) => { if (input) fn(input, key); });

  function getEmailFieldsFromInputs() {
    // En Lecture, les <input> montrent des valeurs résolues, jamais ce qu'il faut enregistrer (Ctrl+S et l'enregistrement automatique ne regardent
    // pas le mode) : le cache tient les gabarits bruts, dans la même forme, tant qu'il n'est pas nul.
    if (emailFieldsRawCache) return emailFieldsRawCache;
    return Object.fromEntries(EMAIL_FIELDS.map(([key, input]) => [key, input ? input.value.trim() : '']));
  }

  function wireCciToggle() {
    if (!emailCciToggle || !emailCciInput) return;
    emailCciToggle.addEventListener('click', () => {
      emailCciInput.hidden = !emailCciInput.hidden;
      emailCciToggle.classList.toggle('is-active', !emailCciInput.hidden);
      if (!emailCciInput.hidden) emailCciInput.focus();
    });
  }

  function setStatus(msg, isError) {
    statusMsg.textContent = msg;
    statusMsg.className = isError ? 'error-msg' : '';
  }

  function getPdfFilenameTemplate() {
    return pdfFilenameInput ? pdfFilenameInput.value.trim() : '';
  }

  // Réglages du macro-modèle chargé que sa fenêtre de composition ne montre pas, tels que l'écran les a : nom du fichier PDF, en-tête et pied de
  // page, page (marges, sens, format). La fenêtre (js/macro-editor.js) et « Enregistrer sous » les réécrivent avec la composition ; remis à zéro, ils
  // seraient perdus en silence.
  function macroSettingsOnScreen() {
    return { nomFichierPDF: getPdfFilenameTemplate(), headerFooter: Editor.getHeaderFooterData(), marginsMm: PageLayout.getMarginsMm() };
  }

  // `preloaded` : la lecture des modèles déjà lancée (init() la démarre en même temps que Grist et l'éditeur) ; sans elle, la liste est relue.
  async function refreshTemplateList(preloaded) {
    const templates = await (preloaded || Templates.loadAll());
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

  // Reflète si le modèle chargé est le modèle par défaut. Rappelée après chaque changement de modèle et après le clic sur le bouton, jamais mise à
  // jour à la main ailleurs : l'icône ne se désynchronise pas de l'état réel.
  function syncDefaultTemplateButton() {
    const btn = document.getElementById('btn-set-default-template');
    if (!btn) return;
    const currentId = Templates.getCurrentId();
    const isDefault = Templates.isDefault(currentId);
    btn.classList.toggle('is-default', isDefault);
    // Un modèle email ou macro ne devient jamais le modèle par défaut (planning/feature-macro-modeles.md) : l'email est une action ponctuelle sur une
    // ligne et le macro-modèle un mode spécialisé, pas des états où le widget doit démarrer. Le bouton est grisé (même traitement que « aucun modèle
    // chargé »), jamais masqué.
    btn.disabled = currentId == null || !Templates.canOpenAtStart(currentTypeModele);
  }

  function wireDefaultTemplateButton() {
    const btn = document.getElementById('btn-set-default-template');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const currentId = Templates.getCurrentId();
      if (!currentId || isReadOnly()) return;
      const wasDefault = Templates.isDefault(currentId);
      await Templates.setDefault(wasDefault ? null : currentId);
      await refreshTemplateList();
      templateSelect.value = currentId;
      syncDefaultTemplateButton();
      setStatus(wasDefault ? I18n.t('status.defaultTemplateCleared') : I18n.t('status.defaultTemplateSet'));
    });
    syncDefaultTemplateButton();
  }

  // Le nom du modèle et son nom de fichier PDF. Ce dernier est toujours replié au chargement, même quand un nom est déjà réglé : l'interface de base
  // reste épurée, le crayon (wirePdfFilenameToggle) le déplie à la demande, et la valeur n'est jamais perdue.
  function showTemplateNames(tpl) {
    if (templateNameInput) templateNameInput.value = tpl ? tpl.nom : '';
    if (pdfFilenameInput) {
      pdfFilenameInput.value = tpl ? (tpl.nomFichierPDF || '') : '';
      pdfFilenameInput.hidden = true;
    }
  }

  // Un macro-modèle n'a pas de contenu TipTap : son Contenu est le JSON de sa composition (planning/feature-macro-modeles.md), que Editor.setHTML()
  // ne doit jamais recevoir. Branche à part, plus courte que le chemin normal (ni champs email, ni auto-enregistrement utile : l'éditeur partagé
  // n'est pas touché), plutôt que des conditions de plus dans loadTemplateIntoEditor.
  function loadMacroIntoEditor(tpl) {
    closeTemplateRenameEditor();
    Editor.exitHeaderFooterModeIfActive();
    GridEditor.setActive(false);
    PageLayout.setMarginsMm(tpl ? tpl.marginsMm : null);
    layerGridsStale = false;
    Editor.setHTML('');
    Editor.setHeaderFooterData(tpl ? tpl.headerFooter : null);
    showTemplateNames(tpl);
    currentTypeModele = 'macro';
    if (emailFieldsRow) emailFieldsRow.hidden = true;
    emailFieldsRawCache = null;
    eachEmailInput(input => { input.value = ''; input.readOnly = false; });
    MainToolbar.setEmailMode(false);
    MainToolbar.setMacroMode(true);
    MainToolbar.setGridMode(false);
    syncExportRowsForModelType();
    HeaderFooterPreview.setEmailMode(false);
    syncA4PreviewForModelType();
    Editor.refreshPaginationPreview();
    MainToolbar.syncToolbarState();
    if (btnCreateEmail) btnCreateEmail.hidden = true;
    Templates.setCurrentId(tpl ? tpl.id : null);
    Comments.loadForTemplate(tpl ? tpl.id : null, tpl).catch(e => console.error('[main] chargement des commentaires impossible', e));
    MacroEditor.showSummary(tpl);
    syncEditorVisibilityForMode();
    applyPageFitZoomToBoth();
    if (currentMode === 'read') renderReader();
    syncDefaultTemplateButton();
    OrientationToggle.sync(currentTypeModele);
    resetAutosaveState(tpl);
  }

  // Affiche l'éditeur, le résumé du macro-modèle ou la Lecture selon le mode et le type du modèle chargé. Partagé par switchMode et les deux
  // chargeurs : un changement de modèle en pleine édition ne repasse pas par switchMode.
  function syncEditorVisibilityForMode() {
    const showEditor = currentMode === 'edit' && currentTypeModele !== 'macro';
    const showMacroSummary = currentMode === 'edit' && currentTypeModele === 'macro';
    editorContainer.style.display = showEditor ? 'block' : 'none';
    // La bande de la barre de la case d'une grille (css/grid.css) disparaît avec l'éditeur : Lecture, résumé d'un macro-modèle.
    document.body.classList.toggle('pp-editor-hidden', !showEditor);
    if (macroSummaryContainer) macroSummaryContainer.style.display = showMacroSummary ? 'block' : 'none';
    // Les barres flottantes d'une bulle, d'un tableau ou d'une image sont ancrées dans l'éditeur : masqué, elles n'ont plus rien à montrer. Sans
    // cela, la barre d'une bulle restée sélectionnée sautait en haut à gauche, par-dessus les boutons Lecture et Édition, et le blur de l'éditeur la
    // réaffichait aussitôt après un clic sur « Lecture ».
    // Le panneau Rechercher / Remplacer (js/find-replace.js) cherche dans l'éditeur : masqué, il se ferme sans lui rendre le clavier.
    if (!showEditor) { EditorCore.hideFloatingContextToolbars(); FindReplace.close({ focus: false }); }
    // Un modèle chargé pendant que l'éditeur était masqué n'a pas pu être mesuré : ses colonnes sont ajustées maintenant qu'il a une mise en page,
    // sinon un tableau trop large pour la page ne rentrerait qu'à la prochaine frappe. Ce n'est pas une modification de la personne : l'état « à
    // enregistrer » reste celui d'avant, sinon un simple retour au Mode édition réécrirait le modèle à la passe d'enregistrement suivante
    // (loadTemplateIntoEditor remet cet état à zéro en dernier, pour la même raison).
    if (showEditor) {
      const wasDirty = autosaveDirty;
      Editor.refreshLayout();
      if (!wasDirty && autosaveDirty) { autosaveDirty = false; updateSaveStatus(); }
      // Orientation changée pendant que l'éditeur était masqué : la grille page des images en calque est recapturée maintenant qu'il a une mise en
      // page.
      recaptureStaleLayerGrids();
    }
  }

  // forcedTypeModele : seulement pour tpl = null (nouveau modèle vide, cf. startNewTemplate) ; un modèle existant porte son propre type, jamais
  // réécrit ici.
  function loadTemplateIntoEditor(tpl, forcedTypeModele) {
    forgetMacroOriginUnless(tpl);
    // Le niveau de zoom gardé pour ce modèle (macro-modèle compris), avant tout calcul du facteur d'ajustement de la page (js/page-zoom.js).
    PageZoom.useTemplate(tpl);
    if (tpl && tpl.typeModele === 'macro') { loadMacroIntoEditor(tpl); return; }
    closeTemplateRenameEditor();
    // Sans cette sortie, changer de modèle pendant l'édition d'un en-tête ou d'un pied de page laisserait leur contenu à la place du document
    // principal qu'on s'apprête à écraser (même garde que l'enregistrement, les exports et la Lecture).
    Editor.exitHeaderFooterModeIfActive();
    // Le garde-fou d'une grille (js/grid-editor.js) refuse tout contenu qui n'est pas un tableau : levé avant de charger un autre modèle, reposé plus
    // bas si c'est une grille.
    GridEditor.setActive(false);
    const typeModele = typeModeleOf(tpl, forcedTypeModele);
    loadContentIntoEditor(tpl, typeModele);
    showTemplateNames(tpl);
    currentTypeModele = typeModele;
    loadEmailFields(tpl);
    MainToolbar.setEmailMode(currentTypeModele === 'email');
    MainToolbar.setMacroMode(false);
    MainToolbar.setGridMode(GridEditor.isGridType(currentTypeModele));
    syncExportRowsForModelType();
    HeaderFooterPreview.setEmailMode(currentTypeModele === 'email');
    // La classe a4-preview sort des conteneurs d'une grille avant que la mise en page (syncEditorVisibilityForMode) et la pagination ne mesurent quoi
    // que ce soit.
    syncA4PreviewForModelType();
    GridEditor.setActive(GridEditor.isGridType(currentTypeModele));
    if (macroSummaryContainer) macroSummaryContainer.style.display = 'none';
    syncEditorVisibilityForMode();
    // Le facteur d'ajustement dépend de la largeur de la page du nouveau modèle (portrait ou paysage) et le conteneur garde sa taille : l'observateur
    // de redimensionnement (wirePageFitZoom) ne le recalculerait pas. Posé avant les rafraîchissements qui suivent (pagination, Lecture).
    applyPageFitZoomToBoth();
    // Editor.setHTML() a déjà déclenché un premier rendu de l'aperçu paginé avant que setEmailMode ne soit posé : sans ce rafraîchissement, les zones
    // de marge cliquables garderaient l'état verrouillé ou déverrouillé du modèle précédent jusqu'à la prochaine frappe.
    Editor.refreshPaginationPreview();
    MainToolbar.syncToolbarState();
    if (btnCreateEmail) btnCreateEmail.hidden = currentTypeModele !== 'email';
    setCurrentTemplate(tpl);
    const headingNumberingSelect = document.getElementById('v2-heading-numbering-select');
    if (headingNumberingSelect) headingNumberingSelect.value = Editor.getHeadingNumberingStyle();
    // En Lecture, le conteneur de l'éditeur est caché : sans ce rendu, le changement de modèle semblerait ne rien faire jusqu'à un passage par le
    // Mode édition.
    if (currentMode === 'read') renderReader();
    if (currentMode === 'read') updateEmailFieldsDisplay();
    updateEmailLengthGauge();
    syncDefaultTemplateButton();
    OrientationToggle.sync(currentTypeModele);
    // En dernier, pas avant : setHTML et setHeaderFooterData déclenchent leurs propres transactions, donc `editor.on('update')` ; sans cette remise à
    // zéro, charger un modèle le marquerait « modifié » pour l'enregistrement automatique.
    resetAutosaveState(tpl);
  }

  function typeModeleOf(tpl, forcedTypeModele) {
    // Le genre propre au modèle, « document » à défaut ; forcedTypeModele ne sert qu'à un nouveau modèle vide (tpl = null).
    return tpl ? (tpl.typeModele || 'document') : (forcedTypeModele || 'document');
  }

  // Le contenu du modèle dans l'éditeur : marges, grille des images, texte avec son suivi des modifications, en-tête et pied.
  function loadContentIntoEditor(tpl, typeModele) {
    // Marges posées avant setHTML : les zones à deux colonnes en mm calculent --layout-left dès leur première construction, à partir de
    // PageLayout.getContentWidthMm() ; posées après, une première passe se ferait avec les marges du modèle précédent.
    PageLayout.setMarginsMm(tpl ? tpl.marginsMm : null);
    layerGridsStale = false;  // les grilles d'un modèle chargé sont celles de sa propre orientation
    // Une grille n'a pas de feuille A4, mais la classe `a4-preview` ne sort des conteneurs que plus bas (syncA4PreviewForModelType), après le
    // chargement : venant d'un document, `setHTML` rognerait le tableau à la largeur d'une page (clampOverflowingTables ne mesure que sous cette
    // classe), et un classeur de 20 colonnes de 64 px arriverait à 36 px par colonne.
    if (GridEditor.isGridType(typeModele)) { editorContainer.classList.remove('a4-preview'); readerContainer.classList.remove('a4-preview'); }
    Editor.setHTML(tpl ? tpl.contenu : '', tpl ? tpl.suiviModifications : null);
    Editor.setHeaderFooterData(tpl ? tpl.headerFooter : null);
  }

  // Les champs d'e-mail (objet, destinataires, Cci…) repartent de ceux du modèle, vides pour un nouveau.
  function loadEmailFields(tpl) {
    if (emailFieldsRow) emailFieldsRow.hidden = currentTypeModele !== 'email';
    // Un changement de modèle invalide le cache des valeurs brutes (cf. updateEmailFieldsDisplay) : on repart d'un état brut pour ce modèle, et la
    // résolution est redemandée plus bas si l'on est en Lecture.
    emailFieldsRawCache = null;
    eachEmailInput((input, key) => { input.readOnly = false; input.value = tpl ? (tpl[key] || '') : ''; });
    if (emailCciInput) {
      // Contrairement au nom du fichier PDF, la Cci reste visible quand elle est déjà réglée.
      emailCciInput.hidden = !emailCciInput.value.trim();
      if (emailCciToggle) emailCciToggle.classList.toggle('is-active', !emailCciInput.hidden);
    }
  }

  // Le modèle devient le modèle courant ; ses commentaires se chargent en arrière-plan.
  function setCurrentTemplate(tpl) {
    Templates.setCurrentId(tpl ? tpl.id : null);
    Comments.loadForTemplate(tpl ? tpl.id : null, tpl).catch(e => console.error('[main] chargement des commentaires impossible', e));
  }

  let nameBeforeEdit = null; // le nom du modèle quand le crayon a ouvert le champ ; null hors saisie
  // La liste choisit et affiche le modèle courant, le crayon fait apparaître le champ du nom à sa place : `hidden` sur le <select> réel suffit,
  // js/template-tree-select.js masque alors son déclencheur (sinon le champ s'ouvrirait à côté de la liste). Le renommage ne touche que l'affichage ;
  // il s'enregistre au prochain clic sur Enregistrer ou à l'enregistrement automatique, qui lit la saisie.
  function closeTemplateRenameEditor() {
    if (!templateNameInput || !templateSelect) return;
    templateNameInput.hidden = true;
    templateSelect.hidden = false;
    nameBeforeEdit = null;
  }

  // Le nom sous lequel le modèle vient d'être enregistré : celui de la galerie, ou « nom (2) » s'il existait déjà (les messages de la galerie disent
  // le nom retenu).
  function savedTemplateName(fallback) {
    const name = templateNameInput ? templateNameInput.value.trim() : '';
    return name || fallback;
  }

  // Un nom déjà pris par un autre modèle devient « nom (2) », « nom (3) »... Posé quand la saisie est validée (Entrée, clic ailleurs,
  // enregistrement), jamais à chaque lettre : le champ ne change pas sous les doigts de la personne qui tape, et l'enregistrement automatique, qui
  // n'écrit que le nom courant, n'y touche pas.
  // Un modèle enregistré dont le nom n'a pas changé reste tel quel, même avec un doublon antérieur : seul un nom nouveau est vérifié (modèle pas
  // encore enregistré, ou nom changé depuis l'ouverture du crayon). Rend le nom retenu ; s'il a changé, le champ le prend et le coin d'état le dit.
  function settleTemplateName() {
    if (!templateNameInput) return '';
    const typed = templateNameInput.value.trim();
    if (!typed) return typed;
    const id = Templates.getCurrentId();
    const stored = Templates.byId(id);
    // Pas encore enregistré (id nul : nouveau modèle, copie, galerie) : le nom est toujours vérifié.
    const previous = id == null ? null : (nameBeforeEdit != null ? nameBeforeEdit : (stored ? stored.nom : null));
    if (previous != null && Templates.sameName(typed, previous)) return typed;
    const unique = Templates.uniqueName(typed, id);
    if (unique !== typed) {
      templateNameInput.value = unique;
      markAutosaveDirty(); // le nom a pu être écrit tel que tapé par un passage de l'enregistrement automatique : le prochain écrit le nouveau
      // Enregistrement automatique coupé, le coin d'état garde « Modifications non enregistrées. » : ce message-là protège ce qui n'est écrit nulle
      // part, le nouveau nom se lit dans le titre.
      if (isAutosaveEnabled()) setStatus(I18n.t('status.nameExists', { name: unique }));
    }
    return unique;
  }

  function wireTemplateRename() {
    const renameBtn = document.getElementById('btn-rename-template');
    if (!renameBtn || !templateNameInput || !templateSelect) return;
    function openEditor() {
      // Le champ reprend la largeur du nom qu'il remplace (120 px au moins) : la barre ne bouge pas, et à 700 px elle ne passe pas sur une deuxième
      // ligne.
      const shown = document.querySelector('#v2-title-cluster .tts-wrap');
      if (shown && shown.offsetWidth) templateNameInput.style.width = Math.max(120, shown.offsetWidth) + 'px';
      nameBeforeEdit = templateNameInput.value.trim();
      templateNameInput.hidden = false;
      templateSelect.hidden = true;
      templateNameInput.focus();
      templateNameInput.select();
    }
    function commitAndClose() {
      if (nameBeforeEdit !== null) settleTemplateName(); // seulement une saisie ouverte par le crayon, pas un blur parasite
      const opt = templateSelect.options[templateSelect.selectedIndex];
      if (opt && templateNameInput.value.trim()) {
        // Même libellé que refreshTemplateList : l'étoile du modèle par défaut reste, la liste le montre avec le nouveau nom jusqu'à
        // l'enregistrement.
        const isDefault = Templates.isDefault(opt.value);
        opt.textContent = isDefault ? (templateNameInput.value.trim() + ' ★') : templateNameInput.value.trim();
      }
      closeTemplateRenameEditor();
    }
    renameBtn.addEventListener('click', () => { templateNameInput.hidden ? openEditor() : commitAndClose(); });
    templateNameInput.addEventListener('blur', commitAndClose);
    templateNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') templateNameInput.blur(); });
  }

  // Quitter le modèle courant avec des modifications en attente
  // Changer de modèle, créer un document, un email ou une grille, ou en créer un depuis la galerie remplace le contenu de l'éditeur : ce qui
  // attendait d'être enregistré (autosaveDirty : enregistrement automatique coupé, ou allumé mais dans les 2,5 s d'avant le prochain passage)
  // disparaîtrait sans rien demander. Une fenêtre Enregistrer / Abandonner / Annuler est donc posée, que l'enregistrement automatique soit allumé ou
  // non.
  // Pas de question quand rien n'attend, ni en lecture seule (rien ne s'enregistre pour cette personne), ni pour un macro-modèle (il s'édite dans sa
  // fenêtre). Les appelants gardent leur chemin synchrone quand il n'y a rien à demander : `if (hasEditsToConfirmBeforeLeaving() && !(await
  // askBeforeLeaving())) return;`.
  function hasEditsToConfirmBeforeLeaving() {
    return autosaveDirty && !isReadOnly() && currentTypeModele !== 'macro';
  }

  // true : on peut continuer (« Abandonner », ou « Enregistrer » réussi) ; false : la personne reste (« Annuler », Échap, enregistrement refusé : le
  // message d'erreur est alors dans le coin d'état). Sans nom il n'y a pas d'« Enregistrer » : un nouveau modèle jamais enregistré ne peut pas l'être
  // tant qu'il n'en a pas.
  async function askBeforeLeaving() {
    const name = templateNameInput ? templateNameInput.value.trim() : '';
    const choices = [{ value: 'discard', label: I18n.t('dialog.unsaved.discard') }];
    if (name) choices.push({ value: 'save', label: I18n.t('common.save'), primary: true });
    leavePromptOpen = true;
    let choice;
    try {
      choice = await Dialogs.choose({
        title: I18n.t('dialog.unsaved.title'),
        message: name ? I18n.t('dialog.unsaved.message', { name }) : I18n.t('dialog.unsaved.messageNoName'),
        choices,
      });
    } finally { leavePromptOpen = false; }
    if (choice === 'discard') return true;
    if (choice === 'save') {
      await onSave();
      return !autosaveDirty;
    }
    // Annuler : la personne reprend où elle en était.
    refocusEditorIfLost();
    return false;
  }

  // Une fenêtre ou une liste abandonnée (« Annuler », la liste des feuilles d'un Excel) : la personne reprend où elle en était. Ouverte depuis une
  // ligne de menu (une étiquette que la souris ne focalise pas), elle n'a aucun focus à rendre : le bouton cliqué, tout juste caché, le garde
  // jusqu'au prochain rendu, d'où le test « n'est plus affiché » en plus du focus sur <body>. Un focus ailleurs, sur un champ où l'on vient de
  // cliquer, y reste.
  function refocusEditorIfLost() {
    const active = document.activeElement;
    if (currentMode === 'edit' && (!active || active === document.body || active.getClientRects().length === 0)) EditorCore.getEditor().commands.focus();
  }

  async function onTemplateSelectChange() {
    const id = templateSelect.value;
    if (hasEditsToConfirmBeforeLeaving()) {
      // La liste referme son menu et rend le focus à son bouton juste après cet évènement : la question vient après, sinon ce focus passerait
      // derrière la fenêtre.
      await Promise.resolve();
      if (!(await askBeforeLeaving())) {
        const currentId = Templates.getCurrentId();
        templateSelect.value = currentId == null ? '' : currentId; // la liste retrouve le modèle qu'on n'a pas quitté
        return;
      }
      // « Enregistrer » a pu rafraîchir la liste : elle montre de nouveau le modèle choisi.
      templateSelect.value = id;
    }
    if (!id) { loadTemplateIntoEditor(null); return; }
    const tpl = Templates.byId(id);
    if (tpl) loadTemplateIntoEditor(tpl);
  }

  // « Modèle selon la ligne » (js/row-template.js) : ouvre le modèle que la ligne désigne, par le chemin ordinaire de la liste - donc avec sa
  // question « Enregistrer / Abandonner / Annuler » quand des modifications attendent. true : ce modèle est ouvert ; false : il ne l'est pas
  // (introuvable, ou « Annuler » : la personne garde le sien).
  async function openTemplateForRow(id) {
    if (!Templates.byId(id) || Templates.isCurrent(id)) return false;
    templateSelect.value = String(id);
    await onTemplateSelectChange();
    return Templates.isCurrent(id);
  }

  // loadTemplateIntoEditor(null) appelle resetAutosaveState(null), puis updateSaveStatus, qui affiche déjà l'avertissement « modèle non
  // enregistré » : ne pas l'écraser après coup par un message générique, il disparaîtrait au moment où il est le plus utile, juste après « Nouveau
  // modèle ». Sans question : onDelete l'appelle quand le modèle courant vient d'être supprimé.
  // typeModele : le type d'un nouveau modèle vide (email : bandeau Objet / À / Cc / Cci et verrouillage de la barre d'outils ; grille : tableau de
  // départ, posé par GridEditor.setActive).
  function startBlankDocument(typeModele) {
    templateSelect.value = '';
    loadTemplateIntoEditor(null, typeModele);
  }

  async function startNewTemplate(typeModele) {
    if (isReadOnly()) return;
    if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return;
    startBlankDocument(typeModele);
  }
  const onNew = () => startNewTemplate();
  const onNewEmail = () => startNewTemplate('email');
  const onNewGrid = () => startNewTemplate(GridEditor.TYPE);

  // Import d'un classeur Excel (js/grid-xlsx-import.js). Le sélecteur de fichier doit s'ouvrir dans le clic ; le classeur est lu ensuite et, s'il a
  // plusieurs feuilles visibles, une liste avec recherche demande laquelle devient la grille. On ne demande de quitter le modèle courant (s'il a des
  // modifications non enregistrées) qu'après ce choix : « Annuler » dans le sélecteur, une liste fermée, un fichier illisible ou une feuille vide ne
  // coûtent rien. Le résultat est une nouvelle grille, sans nom et pas encore enregistrée, comme « Nouvelle grille ».
  const XLSX_IMPORT_ERRORS = { oldFormat: 'status.xlsxImportOldFormat', unreadable: 'status.xlsxImportUnreadable', empty: 'status.xlsxImportEmpty', tooBig: 'status.xlsxImportTooBig' };
  function onImportXlsx() {
    if (isReadOnly()) return;
    GridXlsxImport.chooseFile(async (file) => {
      setStatus(I18n.t('status.xlsxImporting'));
      const imported = await readXlsxForImport(file);
      if (!imported) return;
      if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) { updateSaveStatus(); return; }
      openImportedGrid(imported);
    });
  }

  // Lit le classeur et construit la grille. null : la liste des feuilles a été fermée sans choix, ou le classeur est refusé (l'erreur est dite
  // dans le coin d'état) ; dans les deux cas rien d'autre ne se passe.
  async function readXlsxForImport(file) {
    let chosen = null; // la feuille choisie, quand le classeur en a plusieurs : une erreur la nomme
    try {
      const book = await GridXlsxImport.openFile(file);
      let index = 0;
      if (book.sheets.length > 1) {
        // Sous le « + » : c'est de là que la personne est partie. Elle recouvre le coin d'état, qui n'a rien à dire pendant ce temps (« Lecture… »
        // serait faux, la lecture est finie) ; refermée sans choix, la liste ne change rien : le coin d'état redit l'état du modèle en cours.
        setStatus('');
        const picked = await GridXlsxImport.chooseSheet(book.sheets, { anchor: () => document.getElementById('btn-new').getBoundingClientRect() });
        if (picked === null) { updateSaveStatus(); refocusEditorIfLost(); return null; }
        index = picked;
        chosen = book.sheets[index].name;
      }
      return book.build(index, { lang: I18n.getLang() });
    } catch (e) {
      reportXlsxImportError(e, chosen);
      return null;
    }
  }

  function reportXlsxImportError(e, chosen) {
    console.warn('[main] import Excel impossible', e); // une erreur de la personne (mauvais fichier), pas du widget
    const key = e && e.code === 'empty' && chosen !== null ? 'status.xlsxImportEmptySheet' : (XLSX_IMPORT_ERRORS[e && e.code] || XLSX_IMPORT_ERRORS.unreadable);
    setStatus(I18n.t(key, { sheet: chosen, rows: e && e.rows, cols: e && e.cols, maxRows: e && e.maxRows, maxCols: e && e.maxCols, maxCells: e && e.maxCells }), true);
  }

  function openImportedGrid(imported) {
    // Une nouvelle grille, sans nom et pas encore enregistrée, comme « Nouvelle grille ».
    templateSelect.value = '';
    loadTemplateIntoEditor({ id: null, nom: '', contenu: imported.html, typeModele: GridEditor.TYPE, marginsMm: null, suiviModifications: null, headerFooter: null }, GridEditor.TYPE);
    markAutosaveDirty();
    const counts = { rows: imported.rows, cols: imported.cols };
    setStatus(imported.sheetCount > 1
      ? I18n.t('status.xlsxImportedSheet', Object.assign({ sheet: imported.sheetName, index: imported.sheetIndex + 1, total: imported.sheetCount }, counts))
      : I18n.t('status.xlsxImported', counts));
  }

  // Un nouveau macro-modèle n'a rien à charger avant d'avoir été composé et enregistré : contrairement aux autres types, il ne vide pas l'éditeur, il
  // ouvre l'écran de composition, vide.
  function onNewMacro() {
    if (isReadOnly()) return;
    MacroEditor.openModal(null);
  }

  // Rappel de MacroEditor après « Enregistrer » dans sa fenêtre (nouveau macro-modèle ou modification) : comme la fin d'onSave, il relit la liste,
  // sélectionne ce qui vient d'être enregistré et resynchronise le bouton « par défaut ».
  // renamedTo : le nom retenu quand celui qui était demandé existait déjà (« nom (2) »), que le coin d'état dit à la place de « Macro-modèle
  // enregistré ».
  async function onMacroSaved(id, renamedTo) {
    await refreshTemplateList();
    const done = () => setStatus(renamedTo ? I18n.t('status.nameExists', { name: renamedTo }) : I18n.t('status.macroSaved'));
    // Le macro-modèle est enregistré dans tous les cas ; le charger remplace l'éditeur, donc les modifications en attente du modèle qu'on quitte :
    // même question.
    if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) { done(); return; }
    templateSelect.value = id;
    loadTemplateIntoEditor(Templates.byId(id));
    syncDefaultTemplateButton();
    done();
  }

  // Rappel de MacroEditor quand l'œil d'un modèle du résumé a fini d'écrire la composition (masqué ou affiché, `ok` à faux si Grist a refusé) : le
  // coin d'état le dit, dans la langue de l'interface.
  function onMacroModelVisibility({ name, hidden, ok }) {
    if (!ok) { setStatus(I18n.t('status.saveError'), true); return; }
    setStatus(I18n.t(hidden ? 'status.macroModelHidden' : 'status.macroModelShown', { name }));
  }

  // Ouvrir un modèle d'un macro-modèle, et y revenir
  // Le stylo d'une ligne du résumé d'un macro-modèle (js/macro-editor.js:showSummary) ouvre ce modèle dans l'éditeur comme un choix de la liste ;
  // tant qu'il est à l'écran, le bandeau « Revenir au macro-modèle » (#macro-return-bar) ramène au macro-modèle d'origine. macroOrigin = { macroId,
  // templateId } est remis à null dès qu'un autre modèle se charge (liste, « + », galerie, suppression : forgetMacroOriginUnless, en tête de
  // loadTemplateIntoEditor), jamais quand le même est rechargé (conflit d'enregistrement automatique).

  function syncMacroReturnBar() {
    if (!macroReturnBar) return;
    const macro = macroOrigin && Templates.byId(macroOrigin.macroId);
    macroReturnBar.hidden = !macro;
    const text = document.getElementById('macro-return-text');
    if (!text) return;
    text.textContent = macro ? I18n.t('macro.return.text', { name: macro.nom }) : '';
    text.title = text.textContent; // le nom d'un macro-modèle long est coupé par « … » : la phrase se lit en entier au survol
  }

  function forgetMacroOriginUnless(tpl) {
    if (!macroOrigin || (tpl && Templates.isCurrent(tpl.id))) return;
    macroOrigin = null;
    syncMacroReturnBar();
  }

  // Un macro-modèle n'a rien à enregistrer avant d'être quitté (il s'édite dans sa fenêtre) : pas de question ici, contrairement au retour
  // (returnToMacro). La liste et le cache des modèles sont relus d'abord : un modèle créé ailleurs depuis le dernier passage n'a pas encore sa ligne
  // dans le <select> (le choisir y laisserait « Nouveau modèle »), et le texte lu est celui de Grist.
  async function openTemplateFromMacro(templateId) {
    if (isReadOnly() || currentTypeModele !== 'macro') return;
    const macroId = Templates.getCurrentId();
    if (macroId == null) return;
    await refreshTemplateList();
    const tpl = Templates.byId(templateId);
    // Un autre modèle s'est chargé pendant la relecture (deux clics de suite) : celui-là gagne. Modèle disparu : le macro-modèle reste, la liste le
    // montre de nouveau.
    if (!Templates.isCurrent(macroId)) return;
    if (!tpl || tpl.typeModele === 'macro') { templateSelect.value = macroId; return; }
    templateSelect.value = tpl.id;
    loadTemplateIntoEditor(tpl);
    macroOrigin = { macroId, templateId: tpl.id };
    syncMacroReturnBar();
  }

  // Même chemin qu'un choix du macro-modèle dans la liste : la question « Modifications non enregistrées » est posée si le modèle ouvert en a, et
  // « Annuler » reste sur lui (le bandeau aussi). Le cache des modèles est relu d'abord : Templates.save ne touche pas à Contenu, et ce qui vient
  // d'être modifié ici doit se lire dans le macro-modèle (Lecture, PDF, Word) sans attendre le prochain passage de l'enregistrement automatique.
  async function returnToMacro() {
    const origin = macroOrigin;
    if (!origin) return;
    try { await Templates.loadAll(); } catch (e) { console.error('[main] relecture des modèles impossible', e); }
    // Macro-modèle supprimé depuis (par quelqu'un d'autre) : le modèle reste à l'écran, le bandeau s'efface (choisir une valeur absente de la liste
    // ouvrirait un modèle vide).
    if (!Templates.byId(origin.macroId)) { syncMacroReturnBar(); return; }
    templateSelect.value = origin.macroId;
    await onTemplateSelectChange();
    if (currentTypeModele !== 'macro' || !Templates.isCurrent(origin.macroId)) return;
    // Le stylo du modèle qu'on vient de quitter reprend le focus : le bouton « Revenir » a disparu avec le bandeau.
    const pencil = document.querySelector('.macro-summary-edit[data-template-id="' + CSS.escape(String(origin.templateId)) + '"]');
    if (pencil) pencil.focus();
  }

  function wireMacroReturn() {
    const button = document.getElementById('btn-macro-return');
    if (button) button.addEventListener('click', returnToMacro);
    I18n.onChange(syncMacroReturnBar); // le nom du macro-modèle est dans la phrase du bandeau
  }

  // Un seul enregistrement manuel à la fois. Avec Grist lent, un deuxième clic sur Enregistrer (ou Ctrl+S) pendant la première écriture partait
  // aussitôt : l'identifiant d'un modèle tout neuf n'arrive qu'à la fin de l'écriture, et les deux gestes créaient chacun une ligne sous le même nom.
  // Le deuxième attend la fin du premier (liste relue comprise), puis enregistre ce que l'écran montre alors, dans la même ligne ; plusieurs gestes
  // pendant la même écriture n'en font qu'un, qui lit l'état au moment où il part. Un enregistrement qui ne revient jamais (connexion perdue) ne
  // bloque pas le bouton au-delà de SAVE_WATCHDOG_MS, comme les écritures de js/templates.js.
  const SAVE_WATCHDOG_MS = 60000;
  let saveRunning = null; // la promesse de l'enregistrement en cours
  let saveStartedAt = 0;
  let saveWaiting = null; // celle du geste qui attend sa fin : un seul, quel que soit le nombre de clics
  const saveIsRunning = () => saveRunning !== null && Date.now() - saveStartedAt < SAVE_WATCHDOG_MS;
  // Rend la main quand l'enregistrement en cours est fini, ou passé SAVE_WATCHDOG_MS.
  function whenSaveFinished() {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, Math.max(0, SAVE_WATCHDOG_MS - (Date.now() - saveStartedAt)));
      saveRunning.finally(() => clearTimeout(timer)).then(resolve, resolve);
    });
  }
  function onSave() {
    if (currentTypeModele === 'macro') return runSave(); // le bouton n'y fait qu'ouvrir la fenêtre du macro-modèle : rien à écrire
    if (!saveIsRunning()) {
      saveStartedAt = Date.now();
      const run = saveRunning = runSave().finally(() => { if (saveRunning === run) saveRunning = null; });
      return run;
    }
    if (!saveWaiting) saveWaiting = whenSaveFinished().then(() => { saveWaiting = null; return onSave(); });
    return saveWaiting;
  }

  // Écrit dans Grist le modèle tel que l'écran le montre : `html` (celui de l'éditeur par défaut), ses en-têtes, sa page, son type et ses champs
  // email.
  function saveScreenAs(id, nom, suiviModifications, html = Editor.getHTML()) {
    return Templates.save(id, nom, html, getPdfFilenameTemplate(), Editor.getHeaderFooterData(), PageLayout.getMarginsMm(), currentTypeModele, getEmailFieldsFromInputs(), suiviModifications);
  }

  // Un macro-modèle s'édite uniquement dans sa fenêtre (MacroEditor) : Editor.getHTML() est toujours vide pour ce type et, par le chemin normal,
  // écraserait sa composition par un contenu vide. « Enregistrer » rouvre donc la fenêtre au lieu d'enregistrer.
  async function runSave() {
    if (isReadOnly()) return; // Ctrl+S compris (wireSaveShortcut) : le bouton, lui, est déjà grisé
    if (currentTypeModele === 'macro') {
      MacroEditor.openModal(Templates.byId(Templates.getCurrentId()));
      return;
    }
    Editor.exitHeaderFooterModeIfActive();
    const id = Templates.getCurrentId();
    const typedName = templateNameInput ? templateNameInput.value.trim() : '';
    const nom = settleTemplateName(); // nom déjà pris : « nom (2) »... (la saisie du crayon, une copie, un modèle de la galerie passent tous par ici)
    if (!nom) { setStatus(I18n.t('status.templateNameRequired'), true); return; }
    let savedId, dateModif;
    const epoch = autosaveEpoch;
    try {
      const suiviModifications = await Editor.getSuiviModificationsForSave();
      // Cette attente (l'identification de la personne : une écriture et une lecture de Grist quand elle n'est pas encore connue, des secondes quand
      // Grist est lent) a pu laisser choisir un autre modèle : l'éditeur montre alors celui-là, et l'écrire sous l'identifiant de ce modèle-ci le
      // remplacerait. Le choisir en répondant « Abandonner » renonce à cet enregistrement.
      if (epoch !== autosaveEpoch) return;
      const editVersion = autosaveEditVersion;
      ({ id: savedId, dateModif } = await saveScreenAs(id, nom, suiviModifications));
      // La date écrite est notée tout de suite, avant la relecture de la liste plus bas (une lecture de Grist de plus, des secondes quand il est
      // lent) : un passage de l'enregistrement automatique entre les deux verrait cette date sans la connaître et conclurait « modifié ailleurs »
      // (cf. autosaveTick). Un modèle chargé pendant l'écriture (autosaveEpoch) garde son propre état. Un enregistrement manuel tranche tout conflit
      // en cours en faveur de cette version : pas besoin de recharger.
      if (epoch === autosaveEpoch) {
        autosaveLastKnownDateModif = dateModif;
        noteSaved(editVersion);
        hideConflictBanner();
      }
    } catch (e) {
      // Un échec ici (par exemple une colonne Grist manquante) doit se voir : sans ce traitement, la fonction s'interromprait sans message, la liste
      // et le coin d'état ne seraient pas mis à jour, et rien ne dirait que « Enregistrer » n'a rien enregistré.
      console.error('[main] échec de l’enregistrement manuel', e);
      setStatus(I18n.t('status.saveError'), true);
      return;
    }
    if (epoch === autosaveEpoch) Templates.setCurrentId(savedId);
    await refreshTemplateList();
    // L'écriture et la relecture de la liste durent des secondes quand Grist est lent : un autre modèle a pu être choisi entre-temps (autosaveEpoch).
    // L'écran, la liste et le modèle courant sont alors les siens : ce geste ne les remet pas sur le modèle qu'il vient d'écrire (l'enregistrement
    // automatique y écrirait ensuite ce que l'écran montre), il ne fait que rafraîchir la liste.
    const sameTemplate = epoch === autosaveEpoch;
    const shownId = sameTemplate ? savedId : Templates.getCurrentId();
    templateSelect.value = shownId == null ? '' : shownId;
    syncDefaultTemplateButton();
    // Premier enregistrement d'un modèle tout neuf : Comments n'a encore reçu aucun identifiant de modèle (loadForTemplate n'est appelé que par
    // loadTemplateIntoEditor, qui ne repasse pas par ici). Sans cet appel, « Commenter la sélection » répondrait « Enregistrez d'abord le modèle » à
    // quelqu'un qui vient de l'enregistrer, jusqu'à un changement de modèle. Seulement quand l'identifiant change : un nouvel enregistrement du même
    // modèle n'a rien à recharger, et loadForTemplate referme le panneau ouvert.
    if (sameTemplate && String(id) !== String(savedId)) {
      Comments.loadForTemplate(savedId).catch(e => console.error('[main] chargement des commentaires impossible après création du modèle', e));
      forgetMacroOriginUnless(null); // une copie n'est pas un modèle du macro-modèle d'où l'on venait : le bandeau n'a plus de sens
    }
    updateSaveStatus();
    // à la place de « Enregistré à… » : le nom a changé, c'est ce qu'il faut lire
    if (sameTemplate && nom !== typedName) setStatus(I18n.t('status.nameExists', { name: nom }));
  }

  // La copie est proposée sous le premier nom libre (« Contrat (2) » pour « Contrat ») : Entrée suffit, la saisie est sélectionnée pour la remplacer
  // d'une frappe.
  async function onSaveAs() {
    if (isReadOnly()) return;
    const currentName = templateNameInput ? templateNameInput.value.trim() : '';
    const asked = await Dialogs.prompt({ title: I18n.t('toolbar.saveAs'), label: I18n.t('prompt.newTemplateName'), value: Templates.uniqueName(currentName), confirmLabel: I18n.t('common.save') });
    if (!asked) return;
    const nom = asked.trim();
    if (!nom) return;
    // Un macro-modèle se copie par sa composition (mêmes emplacements, nouvel identifiant) : passer par onSave rouvrirait sa fenêtre au lieu de
    // dupliquer.
    if (currentTypeModele === 'macro') {
      const tpl = Templates.byId(Templates.getCurrentId());
      const macroSlots = tpl && tpl.macroSlots ? tpl.macroSlots : { slots: [] };
      try {
        const kept = macroSettingsOnScreen();
        const copyName = Templates.uniqueName(nom);
        const { id: newId } = await Templates.save(null, copyName, JSON.stringify(macroSlots), kept.nomFichierPDF, kept.headerFooter, kept.marginsMm, 'macro', null);
        await onMacroSaved(newId, copyName !== nom ? copyName : null);
      } catch (e) {
        console.error('[main] échec de la copie du macro-modèle', e);
        setStatus(I18n.t('status.saveError'), true);
      }
      return;
    }
    // Un enregistrement encore en cours (Grist lent) rendrait, à sa fin, son identifiant au modèle courant (cf. runSave) : la copie, qui part d'un
    // modèle sans identifiant, attend qu'il soit fini, celui d'un deuxième clic compris.
    const epoch = autosaveEpoch;
    while (saveIsRunning() || saveWaiting) await (saveWaiting || whenSaveFinished());
    if (epoch !== autosaveEpoch) return; // un autre modèle a été choisi pendant l'attente : la copie n'a plus d'objet
    if (templateNameInput) templateNameInput.value = nom;
    Templates.setCurrentId(null);
    await onSave();
  }

  async function onDelete() {
    if (isReadOnly()) return;
    const id = Templates.getCurrentId();
    if (!id) { setStatus(I18n.t('status.noTemplateSelected'), true); return; }
    if (!(await Dialogs.confirm({ title: I18n.t('confirm.deleteTemplate'), confirmLabel: I18n.t('common.delete'), danger: true }))) return;
    await Templates.remove(id);
    await refreshTemplateList();
    startBlankDocument();
    setStatus(I18n.t('status.templateDeleted'));
  }

  // Droits par personne (js/access-rights.js)
  // Verrou d'interface seulement : grise (classe pp-access-locked, jamais masqué ni retiré), et les gardes des fonctions d'action (onSave,
  // switchMode, withExportLock, autosaveTick...) couvrent les raccourcis clavier et les appels directs. Seules les règles d'accès de Grist protègent
  // les données.
  const ACCESS_LOCK_CLASS = 'pp-access-locked';
  // Tout ce qui modifie le modèle ou écrit dans Grist, en plus de la barre de mise en forme entière (#v2-toolbar, sauf Commenter qui suit son propre
  // droit).
  const READ_ONLY_LOCKED_IDS = ['v2-new-template-group', 'btn-organize-templates', 'v2-save-group', 'btn-delete', 'btn-link-rules',
    'btn-mode-edit', 'btn-rename-template', 'btn-set-default-template', 'v2-pdf-filename-cluster', 'v2-page-group'];
  // Le droit d'export couvre PDF (une ligne, ZIP, PDF unique), Word et la création d'email : #v2-quality-group porte aussi les deux exports DOCX.
  const EXPORT_LOCKED_IDS = ['v2-quality-group', 'v2-export-pdf-group', 'btn-create-email'];
  const READ_ONLY_DISABLED_INPUTS = ['settings-margin-top', 'settings-margin-right', 'settings-margin-bottom', 'settings-margin-left'];
  // Réglage présent au démarrage : les droits sont attendus avant le premier affichage, au plus ce délai (Grist qui tarde à répondre) - au-delà le
  // widget démarre verrouillé (AccessRights.get() tant que le calcul n'a pas abouti) et se déverrouille seul à la réponse.
  const ACCESS_STARTUP_WAIT_MS = 5000;
  // Délai après l'ouverture au bout duquel les colonnes exactes des tables sont relues si rien ne l'a fait (l'affichage du premier modèle les demande
  // déjà, Editor.setHTML).
  const EXACT_SCHEMA_CHECK_MS = 2500;

  function isReadOnly() { return AccessRights.get().readOnly; }

  function setAccessLocked(el, locked) {
    if (!el) return;
    el.classList.toggle(ACCESS_LOCK_CLASS, locked);
    if (locked) el.setAttribute('aria-disabled', 'true');
    else el.removeAttribute('aria-disabled');
  }

  // Barre de mise en forme et d'insertion (#v2-toolbar) : grisée en lecture seule et dès que la Lecture est affichée, choisie ou imposée. L'éditeur y
  // est masqué mais ses commandes restent actives : un clic sur Tableau, Sommaire ou Citation modifierait le modèle caché, que l'enregistrement
  // automatique écrirait sans rien montrer. Commenter suit son propre droit, jamais le mode : dans la Lecture il agit sur le texte sélectionné dans
  // la Lecture (applyCommentsPermissions). Modes, aperçu A4, réglages, arbre des modèles et exports ne font pas partie de #v2-toolbar et restent
  // actifs. Rappelée par applyAccessRights (droits) et switchMode (mode).
  function applyFormattingBarLock() {
    const formattingBar = document.getElementById('v2-toolbar');
    if (!formattingBar) return;
    const locked = isReadOnly() || currentMode === 'read';
    Array.from(formattingBar.children).forEach(child => { if (child.id !== 'v2-btn-comment') setAccessLocked(child, locked); });
  }

  // Commentaires : la Lecture les montre et en accepte de nouveaux (js/comments.js:readerMode) dès qu'elle est affichée, choisie ou imposée par la
  // lecture seule, pour toute personne qui a le droit de commenter. Sans cela, Commenter dans une Lecture choisie poserait sa marque sur la sélection
  // de l'éditeur masqué, enregistrée sans rien montrer. En Édition, Commenter agit sur l'éditeur. Rappelée par applyAccessRights (droits) et
  // switchMode (mode, avant le dessin de la Lecture : renderReader lit cet état).
  function applyCommentsPermissions() {
    const rights = AccessRights.get();
    Comments.setPermissions({ canComment: rights.canComment, readerMode: rights.canComment && (rights.readOnly || currentMode === 'read') });
  }

  function applyAccessRights() {
    const rights = AccessRights.get();
    READ_ONLY_LOCKED_IDS.forEach(id => setAccessLocked(document.getElementById(id), rights.readOnly));
    applyFormattingBarLock();
    setAccessLocked(document.getElementById('v2-btn-comment'), !rights.canComment);
    EXPORT_LOCKED_IDS.forEach(id => setAccessLocked(document.getElementById(id), !rights.canExport));
    READ_ONLY_DISABLED_INPUTS.forEach(id => { const input = document.getElementById(id); if (input) input.disabled = rights.readOnly; });
    applyCommentsPermissions();
    updateSaveStatus();
  }

  // Droits changés en cours de session (case cochée dans la table, réglage modifié) : switchMode force lui-même le mode Lecture en lecture seule ;
  // sinon un mode Lecture déjà affiché est redessiné, commentaires montrés ou non.
  function onAccessRightsChange() {
    applyAccessRights();
    if (isReadOnly() || currentMode === 'read') switchMode(currentMode);
    openCleanReadingForReadOnly();
  }

  // Case « Ouvrir les personnes en lecture seule sur la Lecture épurée » (Réglages > Accès) : voir CleanReading.openForReadOnly, qui décide une seule
  // fois par session. Appelée à la fin d'init() puis à chaque changement de droits : tant que la table des droits n'a pas donné de réponse (pending,
  // Grist lent ; error, table illisible), rien n'est décidé - une personne qui a tous les droits démarre verrouillée par précaution et ne doit jamais
  // être mise en Lecture épurée sur cette foi.
  function openCleanReadingForReadOnly() {
    const config = AccessRights.getConfig();
    CleanReading.openForReadOnly({ state: AccessRights.getStatus().state, readOnly: AccessRights.get().readOnly, enabled: !!(config && config.cleanReading) });
  }

  // Un clic (souris, clavier, ou .click() d'un autre module) sur une commande grisée par applyAccessRights ou applyFormattingBarLock est arrêté en
  // capture, avant tout gestionnaire.
  function wireAccessLockGuard() {
    document.addEventListener('click', event => {
      const target = event.target;
      if (!target || !target.closest || !target.closest('.' + ACCESS_LOCK_CLASS)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  // Enregistrement automatique
  // Enregistre le modèle en cours toutes les AUTOSAVE_INTERVAL_MS, mais seulement s'il y a eu une modification depuis le dernier enregistrement
  // (autosaveDirty) et qu'un modèle existant est chargé : jamais de création automatique, un modèle tout neuf passe d'abord par un Enregistrer manuel
  // (cf. onSave). Il réduit la fenêtre de perte en cas de fermeture inattendue, sans remplacer Enregistrer, et la fenêtre de collision si quelqu'un
  // modifie le même modèle en même temps.
  // Détection de conflit : à chaque vérification, le DateModif présent dans Grist est comparé à celui que ce widget a écrit en dernier
  // (autosaveLastKnownDateModif). Un écart révèle qu'une autre personne (ou un autre onglet) a enregistré ce modèle entre-temps : l'enregistrement
  // automatique se gèle (il n'écrase plus rien) et un bandeau propose de recharger. Un Enregistrer manuel reste possible pendant ce temps et tranche
  // en faveur de la version locale (cf. onSave) : un choix conscient, jamais fait à la place de la personne.
  const AUTOSAVE_INTERVAL_MS = 2500;
  // Au repos (rien à enregistrer), le passage ne relit la table des modèles que toutes les AUTOSAVE_IDLE_INTERVAL_MS : la relire en entier, contenus
  // compris (816 Ko pour 14 modèles avec images), toutes les 2,5 s pour n'y rien trouver chargerait Grist en continu. Dès qu'il y a quelque chose à
  // enregistrer, chaque passage relit avant d'écrire, comme toujours : la protection contre un écrasement ne change pas, seul un enregistrement fait
  // ailleurs pendant que rien ne bouge est signalé plus tard (15 s au plus, davantage pour une table lourde : voir plus bas).
  const AUTOSAVE_IDLE_INTERVAL_MS = 15000;
  // Une table des modèles lourde ne se relit pas à ce rythme : vingt modèles de 1,6 Mo (images comprises), relus quatre fois par minute,
  // c'étaient 118 Mo par minute pour ne rien trouver. L'attente suit le poids de la dernière lecture (Templates.getLoadedChars), une
  // milliseconde pour AUTOSAVE_IDLE_CHARS_PER_MS caractères (3 Mo : 30 s), sans dépasser AUTOSAVE_IDLE_MAX_INTERVAL_MS ; une table de moins de
  // 1,5 Mo garde ses 15 s.
  const AUTOSAVE_IDLE_MAX_INTERVAL_MS = 180000;
  const AUTOSAVE_IDLE_CHARS_PER_MS = 100;
  function autosaveIdleIntervalMs() {
    const byWeight = Math.ceil(Templates.getLoadedChars() / AUTOSAVE_IDLE_CHARS_PER_MS);
    return Math.min(AUTOSAVE_IDLE_MAX_INTERVAL_MS, Math.max(AUTOSAVE_IDLE_INTERVAL_MS, byWeight));
  }
  // Préférence par navigateur (comme la touche de déclenchement #Variable, cf. js/settings.js), pas par document : chacun choisit s'il veut
  // l'enregistrement automatique, indépendamment des autres personnes qui ouvrent le même widget.
  const AUTOSAVE_ENABLED_STORAGE = 'pp_autosave_enabled';
  let autosaveDirty = false;
  let autosaveLastKnownDateModif = null;
  // Dernière fois que le modèle ouvert a été comparé à Grist (performance.now : l'horloge du système peut reculer) : un passage qui a lu, ou le
  // chargement du modèle, qui vient de Grist.
  let autosaveLastCheckAt = -Infinity;
  let autosaveConflictActive = false;
  let autosaveConflictTpl = null;
  let autosaveTimer = null;
  // La question « Enregistrer / Abandonner / Annuler » est posée (askBeforeLeaving) : l'enregistrement automatique n'écrit rien pendant ce temps,
  // sinon « Abandonner » ne laisserait rien à abandonner - ce que la personne a tapé serait déjà enregistré.
  let leavePromptOpen = false;
  // Numéro de la dernière modification (frappe ou réglage, cf. markAutosaveDirty). Un drapeau « à enregistrer » remis à zéro au retour de l'écriture
  // effacerait aussi ce qui a été tapé pendant qu'elle durait (des secondes quand Grist est lent) : ces mots ne seraient pas enregistrés tant qu'une
  // autre frappe ne rallumerait pas le drapeau, alors que « Enregistré à… » s'afficherait. noteSaved(numéro) ne rend « enregistré » que ce qui n'a
  // pas bougé depuis le numéro que l'écriture portait au départ.
  let autosaveEditVersion = 0;
  // Monte à chaque chargement d'un modèle (resetAutosaveState). Un passage ou un enregistrement qui attend Grist le relit à son retour : s'il a
  // changé, le modèle de l'écran n'est plus celui sur lequel il a commencé, et ni la date lue ni l'état « enregistré » qu'il s'apprête à poser ne lui
  // appartiennent plus.
  let autosaveEpoch = 0;
  // Un passage de l'auto-save est en cours (autosaveTick) : celui de l'intervalle suivant ne s'empile pas derrière - sauf s'il dure depuis plus d'une
  // minute (un appel à Grist qui ne revient jamais ne doit pas arrêter l'enregistrement automatique pour de bon).
  let autosaveTickPending = false;
  let autosaveTickStartedAt = 0;
  const AUTOSAVE_TICK_WATCHDOG_MS = 60000;

  function isAutosaveEnabled() {
    try { return localStorage.getItem(AUTOSAVE_ENABLED_STORAGE) !== 'false'; } // absent = activé par défaut
    catch (e) { return true; } // stockage indisponible (navigation privée, quota) : comme activé, plutôt que figé désactivé
  }

  function setAutosaveEnabled(enabled) {
    try { localStorage.setItem(AUTOSAVE_ENABLED_STORAGE, enabled ? 'true' : 'false'); } catch (e) { /* non persisté : actif pour cette session */ }
  }

  // Aspect du bouton Enregistrer d'après ce réglage : bleu et blanc enregistrement automatique allumé, noir et blanc coupé. Deux classes le disent :
  // celle du bouton, et celle de <html> (pp-autosave-off), que le <head> d'index.html pose avant le premier affichage ; posée ici, à la fin du
  // chargement des scripts, elle arriverait après un premier affichage en bleu suivi d'un fondu vers le noir chez qui a coupé l'enregistrement
  // automatique. Remise à l'heure au début d'init, à chaque clic de la ligne du menu et quand un autre onglet change le réglage.
  function syncSaveButtonLook() {
    const off = !isAutosaveEnabled();
    document.documentElement.classList.toggle('pp-autosave-off', off);
    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.classList.toggle('is-autosave-off', off);
  }

  function markAutosaveDirty() { autosaveEditVersion++; autosaveDirty = true; updateSaveStatus(); }
  // Une écriture vient de partir avec l'état de l'éditeur tel qu'il était à la version `editVersion` : ce qui a été tapé depuis reste « à
  // enregistrer » pour le passage suivant.
  function noteSaved(editVersion) { if (editVersion === autosaveEditVersion) autosaveDirty = false; }

  function resetAutosaveState(tpl) {
    autosaveEpoch++;
    autosaveDirty = false;
    autosaveLastKnownDateModif = tpl ? tpl.dateModif : null;
    autosaveLastCheckAt = performance.now();
    hideConflictBanner();
    updateSaveStatus();
  }

  // Coin d'état de la barre d'outils (#status-msg, setStatus). Sans cette fonction, il garderait le dernier message (« Modèle enregistré. », « PDF
  // généré. », une erreur…) même après de nouvelles frappes jamais enregistrées, sans rien dire que ce message est devenu faux. Appelée après chaque
  // frappe (markAutosaveDirty) et après chaque enregistrement ou rechargement, elle fait dire au coin l'état actuel plutôt que le dernier événement :
  // « Enregistré à HH:MM » seulement quand tout ce qui a été tapé est en base, rien sinon (brouillon jamais enregistré, frappe en attente, conflit
  // non résolu) ; avec l'enregistrement automatique coupé, une frappe en attente le dit.
  function updateSaveStatus() {
    // Lecture seule (js/access-rights.js) : rien ne s'enregistre pour cette personne, « Enregistré à… » ou « modèle non enregistré » n'auraient pas
    // de sens.
    if (isReadOnly()) { setStatus(I18n.t('status.readOnly')); return; }
    // Aucun modèle enregistré (pas encore de ligne Grist) : autosaveTick ne peut rien faire tant que ça dure (il ne crée jamais de modèle, cf. son
    // « if (!id) return »). Un statut vide laisserait croire que tout est protégé. Même alerte que templateNameRequired (onSave) : même cause, pas
    // encore de nom ni de ligne.
    if (!Templates.getCurrentId()) { setStatus(I18n.t('status.unsavedTemplateWarning'), true); return; }
    // Enregistrement automatique coupé (son réglage ne se voit plus que dans le menu d'Enregistrer) : rien ne partira tout seul, ce qui vient d'être
    // tapé n'est que dans l'éditeur, et le coin d'état le dit jusqu'au prochain Enregistrer. Seulement dans ce cas : avec l'enregistrement
    // automatique actif, le délai avant le passage suivant ne dure que 2,5 s et le coin reste vide. Avant le test de DateModif : un modèle sans date
    // connue doit pourtant le dire.
    if (autosaveDirty && !autosaveConflictActive && !isAutosaveEnabled()) {
      setStatus(I18n.t('status.unsavedChanges'));
      statusMsg.classList.add('is-unsaved');
      return;
    }
    if (!autosaveLastKnownDateModif) { setStatus(''); return; }
    if (autosaveDirty || autosaveConflictActive) { setStatus(''); return; }
    setStatus(I18n.t('status.savedAt', { time: formatSaveTime(autosaveLastKnownDateModif) }));
  }

  // autosaveLastKnownDateModif vient de Templates.save et loadAll, qui relisent DateModif par fetchTable : Grist rend une colonne DateTime en
  // secondes entières depuis l'epoch, jamais en millisecondes (dev-tests/grist-stub.js reproduit ce comportement), et non en chaîne ISO comme celle
  // qu'on envoie. new Date(secondes) les prendrait pour des millisecondes et afficherait une heure quasi figée.
  // Mais readBackDateModif (js/templates.js) retombe sur la chaîne ISO d'origine quand la relecture échoue : multipliée par 1000, elle donne NaN, et
  // new Date(NaN).toLocaleTimeString() renvoie « Invalid Date » sans lever (le catch ci-dessous ne l'attrape pas). Les deux représentations doivent
  // donc être gérées.
  function formatSaveTime(dateModif) {
    try {
      const d = typeof dateModif === 'number' ? new Date(dateModif * 1000) : new Date(dateModif);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString(I18n.getLang() === 'en' ? 'en-US' : 'fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return ''; }
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

  // Le modèle a-t-il été réécrit par quelqu'un d'autre ? Sa date dans Grist n'est ni celle que ce widget connaît (autosaveLastKnownDateModif) ni
  // celle de sa dernière écriture (Templates.lastWritten : un enregistrement fait par ce widget dont l'état d'ici n'est pas encore à jour, comme un
  // macro-modèle enregistré par sa fenêtre).
  function changedElsewhere(remoteTpl) {
    const known = autosaveLastKnownDateModif;
    if (!remoteTpl || !known || !remoteTpl.dateModif) return false;
    if (Templates.sameDateModif(remoteTpl.dateModif, known)) return false;
    return !Templates.sameDateModif(remoteTpl.dateModif, Templates.lastWritten(remoteTpl.id));
  }

  // Relit la table des modèles et rend { remoteTpl } (la ligne de `id`, absente si le modèle a été supprimé), ou null quand cette lecture ne prouve
  // rien : elle a croisé une écriture de CE widget (la lecture tombe entre l'écriture et la relecture de sa date, ou revient avec l'état d'avant :
  // Grist lent, cf. Templates.getWriteSeq), ou un autre modèle a été chargé pendant ce temps (la ligne relue n'est plus celle de l'écran). Une
  // lecture abandonnée ne perd rien : le passage suivant relit l'état d'alors. Lève si la lecture échoue.
  async function readRemoteTemplate(id, epoch) {
    if (Templates.isWriting()) return null;
    const seq = Templates.getWriteSeq();
    const fresh = await Templates.loadAll();
    if (epoch !== autosaveEpoch || seq !== Templates.getWriteSeq()) return null;
    return { remoteTpl: fresh.find(t => String(t.id) === String(id)) };
  }

  // Un seul passage à la fois : avec Grist lent, un passage (relire la table, écrire, relire la date) dure plus que l'intervalle, et chaque passage
  // de plus s'empilerait, relisant la table pendant que le précédent écrit : jusqu'à trois écritures simultanées, et le faux conflit « modifié
  // ailleurs » que ce chevauchement produit chez une personne seule. Le passage suivant est simplement sauté : un passage lit l'état du moment, il
  // n'y a rien à rattraper.
  async function autosaveTick() {
    if (autosaveTickPending && Date.now() - autosaveTickStartedAt < AUTOSAVE_TICK_WATCHDOG_MS) return;
    autosaveTickPending = true;
    autosaveTickStartedAt = Date.now();
    const startedAt = autosaveTickStartedAt;
    try { await runAutosaveTick(); }
    finally { if (autosaveTickStartedAt === startedAt) autosaveTickPending = false; }
  }

  // Les cas où un passage ne fait rien du tout, avant même de lire la table.
  function autosaveTickBlocked() {
    if (leavePromptOpen) return true;
    if (!isAutosaveEnabled()) return true;  // coupé par la personne (cf. wireSaveMenu) : ni vérification de conflit ni écriture en arrière-plan
    if (exportOperationInProgress) return true; // évite toute contention Grist avec un export en cours
    if (autosaveConflictActive) return true; // gelé tant que l'utilisateur n'a pas choisi (recharger, ou Enregistrer manuellement pour garder sa version)
    return false;
  }

  // Ce qu'un passage écrit, une fois sûr qu'il y a quelque chose à écrire : le nom saisi et le genre du modèle. null : rien à écrire.
  function autosaveWriteTarget(remoteTpl) {
    const nom = templateNameInput ? templateNameInput.value.trim() : '';
    if (!nom) return null; // même garde que le bouton Enregistrer manuel
    // Un macro-modèle n'a rien dans l'éditeur (Editor.getHTML() est toujours vide, cf. loadMacroIntoEditor) : son Contenu est sa composition,
    // réécrite telle que Grist vient de la rendre (remoteTpl, relu plus haut). Sans cela, renommer le macro-modèle ou changer son nom de PDF ou ses
    // marges remplacerait sa composition par un paragraphe vide en moins de 3 s. Macro-modèle introuvable dans Grist (supprimé ailleurs) : rien n'est
    // écrit, jamais une composition inventée.
    const isMacro = currentTypeModele === 'macro';
    if (isMacro && !remoteTpl) return null;
    return { nom, isMacro };
  }

  // L'écriture d'un passage. `epoch` : le modèle choisi quand le passage a commencé ; `editVersion` : l'état de l'édition lu avant de lire quoi que ce
  // soit.
  async function writeAutosave(id, { nom, isMacro }, remoteTpl, epoch, editVersion) {
    try {
      const suiviModifications = isMacro ? null : await Editor.getSuiviModificationsForSave();
      // un autre modèle a été choisi pendant l'attente de l'identification : l'éditeur n'est plus celui dont `id` est la ligne (cf. onSave)
      if (epoch !== autosaveEpoch) return;
      const contenu = isMacro ? remoteTpl.contenu : Editor.getHTML();
      const { dateModif } = await saveScreenAs(id, nom, suiviModifications, contenu);
      // Un autre modèle chargé pendant l'écriture (autosaveEpoch) a son propre état : rien de ceci ne lui appartient.
      if (epoch === autosaveEpoch) {
        autosaveLastKnownDateModif = dateModif;
        noteSaved(editVersion);
        updateSaveStatus();
      }
    } catch (e) {
      console.error('[main] auto-save : échec d’enregistrement', e);
      // autosaveDirty reste vrai : retenté au passage suivant. Affiché, pas seulement journalisé : un échec répété doit se voir dans le coin d'état
      // plutôt que de laisser croire que tout est enregistré.
      setStatus(I18n.t('status.autosaveError'), true);
    }
  }

  async function runAutosaveTick() {
    if (autosaveTickBlocked()) return;
    const id = Templates.getCurrentId();
    if (!id) return; // aucune ligne à mettre à jour - jamais de création automatique
    // Au repos, une lecture toutes les autosaveIdleIntervalMs(), à une demi-période près (un passage un peu en avance lit déjà, au lieu de
    // repousser la lecture d'une période de plus).
    const checkStartedAt = performance.now();
    if (!autosaveDirty && checkStartedAt - autosaveLastCheckAt < autosaveIdleIntervalMs() - AUTOSAVE_INTERVAL_MS / 2) return;
    const epoch = autosaveEpoch;
    let remote;
    try { remote = await readRemoteTemplate(id, epoch); }
    catch (e) { console.error('[main] auto-save : vérification de conflit impossible', e); return; }
    if (!remote) return; // lecture sans valeur (cf. readRemoteTemplate) : rien à comparer ce coup-ci, le passage suivant relira
    autosaveLastCheckAt = checkStartedAt;
    const remoteTpl = remote.remoteTpl;
    if (changedElsewhere(remoteTpl)) {
      showConflictBanner(remoteTpl);
      return;
    }
    if (!autosaveDirty) return;
    // Lecture seule : la vérification de conflit ci-dessus garde son bandeau (le modèle a changé ailleurs), mais rien n'est écrit. Un commentaire
    // posé en Lecture passe par saveReaderCommentAnchors, jamais par ici.
    if (isReadOnly()) return;
    // getHTML() renverrait le fragment d'en-tête ou de pied chargé, pas le document principal (cf. header-footer-preview.js) : on saute ce passage
    // plutôt que de forcer la sortie de ce mode toutes les 2 à 3 s, bien plus gênant que d'attendre le suivant.
    if (Editor.isEditingHeaderFooter()) return;
    const editVersion = autosaveEditVersion; // Avant de lire quoi que ce soit : ce qui est modifié après reste « à enregistrer » (cf. noteSaved)
    const target = autosaveWriteTarget(remoteTpl);
    if (target) await writeAutosave(id, target, remoteTpl, epoch, editVersion);
  }

  function startAutosaveLoop() {
    if (autosaveTimer) return;
    autosaveTimer = setInterval(autosaveTick, AUTOSAVE_INTERVAL_MS);
  }

  // Menu « Enregistrer » : le bouton garde son geste (un clic, un enregistrement) et son survol ouvre « Enregistrer sous… » (une copie) et la case
  // « Enregistrement automatique » (cochée par défaut). Même mécanisme que les autres boutons à menu (.v2-hover-group, css/editor-v2.css).
  // - Le bouton ne prend pas le focus à la souris, comme tout bouton à menu au survol (délégation de js/editor-core.js) : sinon son menu
  //   (:focus-within) resterait affiché une fois la souris partie, et le curseur quitterait le texte. Un champ de saisie qui l'avait (renommage…) le
  //   perd au clic, avant onSave : le nom validé est bien celui qui s'enregistre. Les lignes du menu, des <span tabindex="0">, sont traitées de même.
  // - Entrée et Espace agissent sur les lignes, qui restent ainsi atteignables au clavier ; le menu reste ouvert tant que le focus est dedans. Au
  //   clavier, « Enregistrer sous… » met d'abord le focus sur le bouton : la fenêtre qu'elle ouvre le lui rend à sa fermeture, ce qu'une ligne de
  //   menu refermée ne pourrait pas recevoir.
  // - La boucle setInterval de l'enregistrement automatique tourne toujours une fois démarrée ; seul autosaveTick teste isAutosaveEnabled. Décocher
  //   la case fait donc sauter les passages sans rien arrêter ni recréer (une lecture localStorage toutes les 2,5 s).
  function wireSaveMenu() {
    const saveBtn = document.getElementById('btn-save');
    const saveAsRow = document.getElementById('v2-btn-save-as');
    const autosaveRow = document.getElementById('v2-btn-autosave');
    if (!saveBtn) return;
    const holdFocus = (event) => event.preventDefault();
    const blurTextField = () => {
      const active = document.activeElement;
      if (active && active !== document.body && !active.closest('.ProseMirror') && active.matches('input, textarea, select')) active.blur();
    };
    saveBtn.addEventListener('click', onSave);
    // La coche du menu et l'aspect du bouton disent le même état.
    const syncAutosaveRow = () => {
      if (autosaveRow) autosaveRow.setAttribute('aria-checked', isAutosaveEnabled() ? 'true' : 'false');
      syncSaveButtonLook();
    };
    const toggleAutosave = () => {
      const enabled = !isAutosaveEnabled();
      setAutosaveEnabled(enabled);
      syncAutosaveRow();
      setStatus(I18n.t(enabled ? 'status.autosaveEnabled' : 'status.autosaveDisabled'));
      // Coupé avec des modifications déjà en attente : l'indicateur « Modifications non enregistrées » passe devant le message du geste, qui n'aurait
      // été lu qu'un instant.
      if (!enabled && autosaveDirty) updateSaveStatus();
      // Réactiver ne remet rien à zéro : effacer autosaveDirty ferait perdre ce qui a été tapé pendant la coupure et passer sous silence un
      // changement fait ailleurs. Rien n'est à resynchroniser : onSave et le chargement d'un modèle tiennent autosaveLastKnownDateModif à jour même
      // éteint ; le prochain passage enregistre ce qui est en attente, ou ouvre le bandeau de conflit si le modèle a changé ailleurs.
    };
    const wireRow = (row, action) => {
      if (!row) return;
      row.addEventListener('mousedown', holdFocus);
      row.addEventListener('click', () => { blurTextField(); action(false); });
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        action(true);
      });
    };
    wireRow(saveAsRow, (viaKeyboard) => { if (viaKeyboard) saveBtn.focus(); onSaveAs(); });
    wireRow(autosaveRow, toggleAutosave);
    syncAutosaveRow();
    // Le choix est par navigateur : un autre onglet (ou un autre widget du même document) qui le change se voit ici aussi, sans rechargement.
    // L'évènement ne part que dans les autres pages ; `key` vaut null quand tout le stockage est vidé.
    window.addEventListener('storage', (event) => {
      if (event.key !== null && event.key !== AUTOSAVE_ENABLED_STORAGE) return;
      syncAutosaveRow();
      if (autosaveDirty) updateSaveStatus();
    });
  }

  // Un tableau de tableur plus grand que ce que la mise en forme garde (js/grid-table.js) est collé tel quel : la fenêtre le dit, une fois le
  // collage fait. Le coin d'état ne le dirait pas : le collage le remet à l'état d'enregistrement, et l'enregistrement automatique à nouveau 2,5 s
  // plus tard, sur un tableau qui peut figer la page un moment.
  function wirePasteTooBigNotice() {
    GridTable.setTooBigHandler(({ kind, count, max }) => {
      const number = n => n.toLocaleString(I18n.getLang() === 'en' ? 'en-US' : 'fr-FR');
      // Pas dans le collage même : la fenêtre prendrait le focus avant que ProseMirror ait fini de poser le tableau.
      setTimeout(async () => {
        await Dialogs.choose({ title: I18n.t('dialog.pasteTooBig.title'), message: I18n.t('dialog.pasteTooBig.' + kind, { count: number(count), max: number(max) }), choices: [], cancelLabel: I18n.t('common.close') });
      }, 0);
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

  // Slots du macro-modèle actuellement chargé (Templates.getCurrentId()), ou une liste vide si aucun/pas macro - jamais null, pour épargner aux
  // appelants la vérification.
  function getCurrentMacroSlots() {
    const tpl = Templates.byId(Templates.getCurrentId());
    return (tpl && tpl.macroSlots) ? tpl.macroSlots : { slots: [] };
  }

  // Pour un macro-modèle, le contenu à résoudre n'est jamais Editor.getHTML() (toujours vide, cf. loadMacroIntoEditor) mais la concaténation des
  // modèles retenus pour cette ligne ou cette table (MacroTemplates.buildConcatenatedHtml) : la page de garde et les annexes partagent la même ligne,
  // un seul appel suffit.
  async function currentDocumentHtml(tableId, record) {
    if (currentTypeModele !== 'macro') return Editor.getHTML();
    if (!record || !tableId) return '';
    return MacroTemplates.buildConcatenatedHtml(getCurrentMacroSlots(), tableId, record, Templates.getCached());
  }

  async function renderReader(record, recordTableId) {
    if (typeof record === 'undefined') record = latestRecord || GristAPI.getCurrentRecord();
    let tableId = recordTableId || GristAPI.getCurrentTableId() || currentTableId;
    // Sans ligne sélectionnée, ReaderMode.render() affiche tout de même son état vide : un simple `return` laisserait #reader-container vide, un
    // écran blanc sans explication. onCreateEmail (mode email) appelle aussi renderReader() alors que currentMode reste 'edit', pour lire le corps
    // résolu sans changer de mode : #reader-container reste display:none tant que currentMode !== 'read' (cf. switchMode).
    if (!record) { await ReaderMode.render(await currentDocumentHtml(tableId, null), tableId, null, Editor.getHeaderFooterData()); return; }
    if (!tableId) {
      const ctx = await GristAPI.detectCurrentContext();
      if (ctx && ctx.tableId) { currentTableId = ctx.tableId; tableId = ctx.tableId; }
    }
    readerContainer.classList.toggle('pp-reader-comments', readerCommentsActive());
    // Le HTML est donné par une fonction : l'assemblage d'un macro-modèle (ses règles de slot) relit des tables, ce qui doit se faire dans les
    // lectures partagées de ce rendu.
    const html = () => (readerCommentsActive() ? Comments.buildReaderHtml() : currentDocumentHtml(tableId, record));
    await ReaderMode.render(html, tableId, record, Editor.getHeaderFooterData());
  }

  // Mode Lecture affiché (imposé par la lecture seule ou choisi) avec droit de commenter (js/comments.js:readerMode, applyCommentsPermissions) : il
  // montre les commentaires et en accepte de nouveaux, sur un HTML qui porte les positions du document. Jamais pour un macro-modèle : son contenu
  // vient d'autres modèles, pas de l'éditeur.
  function readerCommentsActive() { return Comments.isReaderMode() && currentTypeModele !== 'macro'; }

  // Commentaire posé, résolu ou supprimé depuis le mode Lecture : l'auto-save n'écrit rien en lecture seule (et n'a peut-être pas encore tourné quand
  // le mode Lecture est choisi), le modèle (sa marque de commentaire) est donc enregistré ici - et seulement s'il n'a pas changé ailleurs depuis son
  // chargement, sinon la marque écraserait ce changement (même contrôle de DateModif que autosaveTick). false = rien d'enregistré, js/comments.js
  // annule alors son changement de marque.
  async function saveReaderCommentAnchors() {
    const id = Templates.getCurrentId();
    if (!id || currentTypeModele === 'macro' || autosaveConflictActive) return false;
    const nom = templateNameInput ? templateNameInput.value.trim() : '';
    if (!nom) return false;
    const epoch = autosaveEpoch;
    let remote;
    try {
      remote = await readRemoteTemplate(id, epoch);
      // Une écriture de ce widget (un passage de l'enregistrement automatique) a croisé la lecture : on attend qu'elle finisse et on relit, plutôt
      // que d'annuler le commentaire de la personne.
      if (!remote) { await Templates.whenIdle(); remote = await readRemoteTemplate(id, epoch); }
    }
    catch (e) { console.error('[main] commentaire en lecture : vérification de conflit impossible', e); return false; }
    if (!remote || !remote.remoteTpl) return false;
    const remoteTpl = remote.remoteTpl;
    if (changedElsewhere(remoteTpl)) { showConflictBanner(remoteTpl); return false; }
    try {
      const suiviModifications = await Editor.getSuiviModificationsForSave();
      const editVersion = autosaveEditVersion;
      const { dateModif } = await saveScreenAs(id, nom, suiviModifications);
      if (epoch === autosaveEpoch) {
        autosaveLastKnownDateModif = dateModif;
        noteSaved(editVersion);
        updateSaveStatus();
      }
      // Cache des modèles relu (Templates.save ne le touche pas) : revenir plus tard sur ce modèle doit montrer la marque qui vient d'être posée.
      Templates.loadAll().catch(e => console.error('[main] relecture des modèles impossible', e));
      return true;
    } catch (e) {
      console.error('[main] commentaire en lecture : échec d’enregistrement du modèle', e);
      return false;
    }
  }

  // Bascule l'affichage d'Objet/À/Cc/Cci entre gabarit brut (édition) et valeurs résolues (lecture) sur les mêmes <input>, jamais dupliqués (cf.
  // emailFieldsRawCache ci-dessus). Sans ligne sélectionnée, les gabarits bruts restent affichés (rien à résoudre) plutôt qu'un champ vidé sans
  // explication.
  async function updateEmailFieldsDisplay() {
    if (!emailFieldsRow || currentTypeModele !== 'email') return;
    if (currentMode !== 'read') {
      if (!emailFieldsRawCache) return; // déjà en état brut, rien à restaurer
      const raw = emailFieldsRawCache;
      emailFieldsRawCache = null;
      eachEmailInput((input, key) => { input.value = raw[key]; input.readOnly = false; });
      return;
    }
    if (!emailFieldsRawCache) {
      emailFieldsRawCache = getEmailFieldsFromInputs();
      eachEmailInput(input => { input.readOnly = true; });
    }
    const record = latestRecord || GristAPI.getCurrentRecord();
    if (!record) return;
    const tableId = latestRecordTableId || GristAPI.getCurrentTableId() || currentTableId;
    const raw = emailFieldsRawCache;
    const resolved = await resolveEmailFieldsForRecord(raw, tableId, record);
    // Repassé en édition (ou modèle changé) pendant la résolution : emailFieldsRawCache a déjà été traité par la branche ci-dessus, ne pas écraser
    // son travail avec ce résultat maintenant obsolète.
    if (currentMode !== 'read' || emailFieldsRawCache !== raw) return;
    eachEmailInput((input, key) => { input.value = resolved[key]; });
  }

  // L'URL mailto: de cette ligne : les champs résolus, et le corps lu dans le rendu de la Lecture (ReaderMode.render : mêmes bulles et chips que le
  // PDF). `stale` (facultatif) rend vrai quand un résultat plus récent a pris le relais : l'URL n'est alors pas construite (null).
  async function buildMailtoForRecord(record, tableId, stale) {
    const fields = await resolveEmailFieldsForRecord(getEmailFieldsFromInputs(), tableId, record);
    await renderReader(record, tableId);
    if (stale && stale()) return null;
    const content = readerContainer.querySelector('.reader-content');
    const bodyText = MailtoExport.plainTextFromHtml(content ? content.innerHTML : readerContainer.innerHTML);
    return MailtoExport.buildMailtoUrl({ to: fields.destinataires, cc: fields.cc, bcc: fields.cci, subject: fields.objet, bodyText });
  }

  // Jauge de longueur mailto:, permanente, sur l'URL résolue (to+cc+cci+objet+corps) et non sur le gabarit tapé : un accent ou un retour à la ligne
  // coûte plus cher une fois encodé (cf. MailtoExport). Dépend de la ligne sélectionnée : appelée à chaque changement de ligne, de modèle ou de
  // contenu (avec un debounce, cf. scheduleEmailLengthGauge) ; jamais bloquante, seulement informative.
  let emailGaugeRunId = 0;
  async function updateEmailLengthGauge() {
    if (!emailCharCounter) return;
    if (currentTypeModele !== 'email') { emailCharCounter.hidden = true; return; }
    const runId = ++emailGaugeRunId;
    const record = latestRecord || GristAPI.getCurrentRecord();
    if (!record) { emailCharCounter.hidden = true; return; }
    const tableId = latestRecordTableId || GristAPI.getCurrentTableId() || currentTableId;
    const url = await buildMailtoForRecord(record, tableId, () => runId !== emailGaugeRunId);
    if (url === null) return; // une résolution plus récente a déjà pris le relais
    const check = MailtoExport.checkUrlLength(url);
    emailCharCounter.hidden = false;
    emailCharCounter.classList.toggle('is-over-limit', !check.safe);
    emailCharCounter.textContent = I18n.t(check.safe ? 'email.charCount' : 'email.charCountOverLimit', { count: check.length, limit: check.limit });
  }
  let emailGaugeDebounceTimer = null;
  function scheduleEmailLengthGauge() {
    if (currentTypeModele !== 'email') return;
    if (emailGaugeDebounceTimer) clearTimeout(emailGaugeDebounceTimer);
    emailGaugeDebounceTimer = setTimeout(updateEmailLengthGauge, 500);
  }

  // Verrou anti-double-export : pdf-export.js numérote les notes de bas de page dans un état de module partagé, que deux exports en parallèle
  // corrompraient en silence. Tous les contrôles d'export (EXPORT_CONTROL_IDS) sont désactivés pendant toute opération, pas seulement celui cliqué.
  let exportOperationInProgress = false;
  // `v2-btn-export-pdf-batch` est un <span> (ligne de menu au survol), pas un <button> - `.disabled` n'a aucun effet dessus (propriété réservée aux
  // contrôles de formulaire) ; `pointer-events`/`opacity` fonctionnent sur n'importe quel élément.
  function setExportControlLocked(el, locked) {
    if (!el) return;
    if ('disabled' in el) el.disabled = locked;
    el.style.pointerEvents = locked ? 'none' : '';
    el.style.opacity = locked ? '.5' : '';
  }
  // Un bouton grisé perd le focus (le navigateur le rend au corps de la page) : sans ce rappel, le clavier repartirait du début de la page à la fin
  // d'un export ou quand la fenêtre « Email trop long » se referme (elle n'a alors plus d'élément d'origine à retrouver). Seul un focus posé au
  // clavier (cadre de focus visible) est rendu : à la souris rien ne change. Rien n'est rendu si le focus est allé ailleurs pendant l'export ; un
  // élément resté actif mais masqué (le bouton de la fenêtre qui vient de se fermer) n'est pas un focus déplacé.
  function keyboardFocusedElement() {
    const el = document.activeElement;
    return el && el !== document.body && el.matches(':focus-visible') ? el : null;
  }
  function restoreKeyboardFocus(el) {
    if (!el || !el.isConnected) return;
    const now = document.activeElement;
    const movedElsewhere = now && now !== document.body && now !== el && now.getClientRects().length > 0;
    if (!movedElsewhere) el.focus({ preventScroll: true });
  }
  // Les contrôles qu'un export en cours grise : tous les exports et « Créer l'email », pour qu'on ne lance pas un second export par-dessus le
  // premier.
  const EXPORT_CONTROL_IDS = ['btn-export-pdf', 'v2-btn-export-pdf-batch', 'v2-btn-export-pdf-merged', 'v2-btn-export-pdf-sheets', 'v2-btn-export-docx', 'v2-btn-export-docx-batch', 'v2-btn-export-xlsx',
    'v2-btn-export-xlsx-batch', 'v2-btn-export-xlsx-single', 'btn-create-email'];
  function withExportLock(fn) {
    return async (...args) => {
      if (exportOperationInProgress || !AccessRights.get().canExport) return;
      exportOperationInProgress = true;
      const controls = EXPORT_CONTROL_IDS.map(id => document.getElementById(id));
      const keyboardFocus = keyboardFocusedElement();
      OrientationToggle.setBusy(true);
      controls.forEach(el => setExportControlLocked(el, true));
      // Un clic = un lancement (un lot entier compris) : les sites d'images déjà acceptés ne sont pas redemandés, un refus arrête tout
      // (js/external-images.js).
      ExternalImages.beginRun();
      ExportCommon.resetUnreadImages();
      try {
        await fn(...args);
      } finally {
        ExternalImages.endRun();
        exportOperationInProgress = false;
        OrientationToggle.setBusy(false);
        controls.forEach(el => setExportControlLocked(el, false));
        restoreKeyboardFocus(keyboardFocus);
      }
    };
  }

  // L'état de fin d'un export réussi : son texte, précédé - quand des images n'ont pas pu être lues et manquent dans le fichier
  // (ExportCommon.noteUnreadImage) - de leur nombre, en tête : le coin d'état coupe ce qui dépasse, à droite. Le fichier est bien produit : ce n'est
  // pas une erreur (pas de rouge), mais la personne n'a plus à ouvrir le fichier pour s'en apercevoir.
  function setExportDoneStatus(text) {
    const unread = ExportCommon.unreadImageCount();
    setStatus(unread ? I18n.t('status.imagesUnread', { n: unread }) + ' ' + text : text);
  }

  // Le document de la ligne courante pour un export seul : { html, headerFooterData } - ceux du modèle, avec la valeur de chaque liste réglée « Un
  // document par valeur » (js/list-split.js) quand elle n'en a qu'une -, ou { split } quand la ligne fait plusieurs documents : l'appelant passe
  // alors à l'archive d'onExportBatch (PDF, Word ou Excel, un fichier par valeur). Sans liste ainsi réglée, le HTML et les en-têtes du modèle, tels
  // quels.
  async function currentRecordDocument(tableId, record) {
    const html = await currentDocumentHtml(tableId, record);
    const headerFooterData = Editor.getHeaderFooterData();
    const plan = await ListSplit.plan(ListSplit.partsOf(html, headerFooterData), tableId, record);
    if (plan.variants.length > 1) return { split: { record, plan, html } };
    return { html: ListSplit.pin(html, plan.variants[0]), headerFooterData: ListSplit.pinHeaderFooter(headerFooterData, plan.variants[0]) };
  }

  // Les exports d'une seule ligne : le lot que prend son document quand « Un document par valeur » le découpe, l'alerte sans ligne, les textes du
  // coin d'état et l'export lui-même (`doc` : { html, headerFooterData }, cf. currentRecordDocument). Word n'a ni sélecteur de qualité ni autre mode
  // (cf. en-tête de js/docx-export.js). Excel exporte le tableau d'une grille, sans en-tête ni pied de page ni marges du document : la feuille
  // reprend l'orientation et les marges de PageLayout.
  const SINGLE_EXPORTS = {
    pdf: {
      batch: 'pdfZip', noRecord: 'alert.noRecordForExport', generating: 'status.pdfGenerating', generated: 'status.pdfGenerated', failed: 'status.pdfGenerationError',
      run: (doc, tableId, record) => PdfExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, PageLayout.getMarginsPt()),
    },
    docx: {
      batch: 'docxZip', noRecord: 'alert.noRecordForExport', generating: 'status.docxGenerating', generated: 'status.docxGenerated', failed: 'status.docxGenerationError',
      run: (doc, tableId, record) => DocxExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, PageLayout.getMarginsTwip()),
    },
    xlsx: {
      batch: 'xlsxZip', noRecord: 'alert.noRecordForExportXlsx', generating: 'status.xlsxGenerating', generated: 'status.xlsxGenerated', failed: 'status.xlsxGenerationError',
      run: (doc, tableId, record) => XlsxExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate()),
    },
  };

  async function exportRecordAs(kind) {
    const spec = SINGLE_EXPORTS[kind];
    Editor.exitHeaderFooterModeIfActive();
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert(exportText(spec.noRecord)); return; }
    setStatus(I18n.t(spec.generating));
    try {
      const tableId = currentTableId || GristAPI.getCurrentTableId();
      const doc = await currentRecordDocument(tableId, record);
      if (doc.split) { await onExportBatch(spec.batch, doc.split); return; }
      await spec.run(doc, tableId, record);
      setExportDoneStatus(I18n.t(spec.generated));
    } catch (e) {
      // « Annuler » sur la fenêtre des images d'un site externe (js/external-images.js) : un choix, pas une erreur.
      if (ExternalImages.isCancel(e)) { setStatus(I18n.t('status.exportCancelled')); return; }
      console.error(e);
      setStatus(I18n.t(spec.failed), true);
    }
  }
  const onExportPdf = () => exportRecordAs('pdf');
  const onExportDocx = () => exportRecordAs('docx');
  const onExportXlsx = () => exportRecordAs('xlsx');

  // Mode email (planning/feature-email-mode.md) : construit l'URL mailto: de la ligne courante et l'ouvre par un <a> synthétique plutôt que
  // window.location.href, dont le comportement dans l'iframe sandboxée d'un widget Grist est moins prévisible. Le corps réutilise la résolution du
  // mode Lecture (ReaderMode.render : mêmes bulles et chips que le PDF) plutôt que de la dupliquer ; renderReader() ne fait que mettre à jour
  // #reader-container, jamais visible tant que currentMode reste 'edit' (cf. switchMode).
  async function onCreateEmail() {
    Editor.exitHeaderFooterModeIfActive();
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert(I18n.t('alert.noRecordForEmail')); return; }
    const tableId = currentTableId || GristAPI.getCurrentTableId();
    setStatus(I18n.t('status.emailGenerating'));
    try {
      const url = await buildMailtoForRecord(record, tableId);
      const check = MailtoExport.checkUrlLength(url);
      if (!check.safe && !(await Dialogs.confirm({
        title: I18n.t('dialog.emailTooLong.title'), message: I18n.t('confirm.emailTooLong', { length: check.length, limit: check.limit }), confirmLabel: I18n.t('common.continue'),
      }))) {
        setStatus('');
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus(I18n.t('status.emailCreated'));
    } catch (e) {
      console.error('[main] échec de la création de l’email', e);
      setStatus(I18n.t('status.emailCreationError'), true);
    }
  }

  // Dans une grille, « lignes » devient « valeurs de la table » : une ligne y est déjà une ligne de la grille. Les autres types de modèle gardent
  // leurs mots. Chaque texte concerné a sa variante « …Grid » ici ; `exportText` choisit selon le type du modèle affiché.
  const GRID_WORDING = {
    'toolbar.exportPdfBatch': 'toolbar.exportPdfBatchGrid',
    'toolbar.exportPdfMerged': 'toolbar.exportPdfMergedGrid',
    'dialog.batchExport.title': 'dialog.batchExport.titleGrid',
    'confirm.batchExport': 'confirm.batchExportGrid',
    'confirm.mergedExport': 'confirm.mergedExportGrid',
    'status.cannotReadRows': 'status.cannotReadRowsGrid',
    'status.noRowsInTable': 'status.noRowsInTableGrid',
    'status.mergedExportDone': 'status.mergedExportDoneGrid',
    'status.mergedExportDoneWithFailures': 'status.mergedExportDoneWithFailuresGrid',
    'status.sheetsExportDone': 'status.sheetsExportDoneGrid',
    'status.sheetsExportDoneWithFailures': 'status.sheetsExportDoneWithFailuresGrid',
    'alert.noRecordForExport': 'alert.noRecordForExportGrid',
  };
  function exportText(key, vars) {
    return I18n.t(GridEditor.isGridType(currentTypeModele) && GRID_WORDING[key] ? GRID_WORDING[key] : key, vars);
  }

  // Les exports qui n'ont de sens que pour un seul genre de modèle : Word pour un document, Excel pour une grille. La ligne de l'autre genre reste
  // dans le menu, grisée ; son clic ne fait rien (cf. onExportRow, au câblage des boutons). Les deux lignes PDF « toutes les lignes » prennent aussi
  // les mots de la grille (`data-i18n` change, pour que le texte suive un changement de langue).
  function syncExportRowsForModelType() {
    const grid = GridEditor.isGridType(currentTypeModele);
    const grey = (id, off) => {
      const row = document.getElementById(id);
      if (!row) return;
      row.classList.toggle('v2-hover-row-disabled', off);
      if (off) row.setAttribute('aria-disabled', 'true'); else row.removeAttribute('aria-disabled');
    };
    ['v2-btn-export-docx', 'v2-btn-export-docx-batch'].forEach(id => grey(id, grid));
    ['v2-btn-export-xlsx', 'v2-btn-export-xlsx-batch', 'v2-btn-export-xlsx-single'].forEach(id => grey(id, !grid));
    [['v2-btn-export-pdf-batch', 'toolbar.exportPdfBatch'], ['v2-btn-export-pdf-merged', 'toolbar.exportPdfMerged']].forEach(([id, key]) => {
      const row = document.getElementById(id);
      if (!row) return;
      const wanted = grid ? GRID_WORDING[key] : key;
      row.setAttribute('data-i18n', wanted);
      row.textContent = I18n.t(wanted);
    });
  }

  // Caractères invalides dans un nom de fichier ZIP ou Windows : une valeur de cellule comme « Dupont/Fils » casserait l'arborescence du ZIP si elle
  // n'était pas filtrée.
  function sanitizeFilenamePart(name) {
    return String(name || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
  }

  // Ajoute un suffixe « (2) », « (3) »… si ce nom a déjà servi dans ce lot : deux lignes peuvent résoudre au même nom (gabarit sans variable, ou
  // variable identique), et la seconde écraserait la première dans le ZIP.
  function uniqueZipFilename(baseName, usedNames) {
    let name = baseName;
    let n = 2;
    while (usedNames.has(name)) { name = baseName + ' (' + n + ')'; n++; }
    usedNames.add(name);
    return name;
  }

  // Export en lot : une ligne = un fichier, regroupés dans une archive ZIP (PDF, DOCX ou classeur Excel), ou mis bout à bout dans un seul PDF
  // (js/pdf-merge.js : même rendu par ligne que le ZIP, une nouvelle page par ligne) ou un seul classeur Excel (une feuille par ligne,
  // js/xlsx-export.js). Lit toutes les lignes via docApi, sans le filtre de vue.
  // Ce qui change d'un export à l'autre : ses textes (clés i18n), le nom des fichiers, la fonction qui rend une ligne et ses marges (points pour le
  // PDF, twips pour le DOCX, aucune pour l'Excel dont la feuille reprend la page du modèle) et ses bibliothèques (`loadLibs` : l'archive ZIP n'a
  // besoin que de JSZip, ~0,1 Mo, pas du lot PDF de ~4 Mo). Le reste (lecture des lignes, confirmation, boucle, archive, téléchargement) est commun.
  // - `single` : pas de blob par ligne, le classeur unique reçoit une feuille par ligne.
  // - `grid` : le genre de modèle que l'export sait faire (faux : un document, Word ; vrai : une grille, Excel ; absent : les deux, PDF). Une ligne
  //   dont « Modèle selon la ligne » désigne un modèle d'un autre genre n'est pas générée (comptée en échec).
  // - `pageOptions` : la page d'une feuille Excel, lue sur les réglages de page posés (ceux de l'écran, ou ceux du modèle d'une ligne, cf.
  //   templateSource).
  const PDF_BATCH = {
    label: 'PDF', loading: 'status.loadingPdfLibs', loadError: 'status.pdfLibsLoadError', progress: 'status.batchExportProgress', noFile: 'status.exportError',
    margins: () => PageLayout.getMarginsPt(),
    renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins) => PdfExport.getNativePdfBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, margins),
  };
  const BATCH_EXPORTS = {
    pdfZip: Object.assign({}, PDF_BATCH, {
      confirm: 'confirm.batchExport', done: 'status.batchExportDone', doneWithFailures: 'status.batchExportDoneWithFailures',
      entryExt: '.pdf', fileSuffix: '-export-pdf.zip',
      loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await ExportCommon.ensureJsZipLoaded(); },
    }),
    pdfMerged: Object.assign({}, PDF_BATCH, {
      confirm: 'confirm.mergedExport', done: 'status.mergedExportDone', doneWithFailures: 'status.mergedExportDoneWithFailures',
      splitDone: 'status.splitMergedDone', splitDoneWithFailures: 'status.splitMergedDoneWithFailures',
      merged: true, fileSuffix: '-export.pdf',
      loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await PdfMerge.ensureLibLoaded(); },
    }),
    // Assemblage avant impression (js/sheet-assembly-dialog.js, js/sheet-layout.js) : les mêmes PDF par ligne que le PDF unique, posés sur des
    // feuilles A4 ou A3 (js/pdf-merge.js:createSheets). La fenêtre de réglage tient lieu de confirmation (`sheets`) ; le fichier sort sous le nom
    // `<table>-assemblage.pdf`.
    pdfSheets: Object.assign({}, PDF_BATCH, {
      done: 'status.sheetsExportDone', doneWithFailures: 'status.sheetsExportDoneWithFailures',
      splitDone: 'status.splitSheetsDone', splitDoneWithFailures: 'status.splitSheetsDoneWithFailures',
      merged: true, sheets: true, fileSuffix: '-assemblage.pdf',
      loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await PdfMerge.ensureLibLoaded(); },
    }),
    docxZip: {
      label: 'DOCX', confirm: 'confirm.batchExportDocx', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressDocx',
      noFile: 'status.exportErrorDocx', done: 'status.batchExportDoneDocx', doneWithFailures: 'status.batchExportDoneWithFailuresDocx',
      entryExt: '.docx', fileSuffix: '-export-docx.zip', margins: () => PageLayout.getMarginsTwip(), grid: false,
      loadLibs: () => ExportCommon.ensureJsZipLoaded(),
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins) => DocxExport.getDocxBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, margins),
    },
    xlsxZip: {
      label: 'Excel', confirm: 'confirm.batchExportXlsx', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressXlsx',
      noFile: 'status.exportErrorXlsx', done: 'status.batchExportDoneXlsx', doneWithFailures: 'status.batchExportDoneWithFailuresXlsx',
      entryExt: '.xlsx', fileSuffix: '-export-xlsx.zip', grid: true, pageOptions: () => XlsxExport.pageOptionsFromLayout(),
      loadLibs: async () => { await ExportCommon.ensureJsZipLoaded(); await XlsxExport.ensureExcelLibLoaded(); },
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins, pageOptions) => XlsxExport.getXlsxBlobForRecord(html, tableId, row, filenameTemplate, pageOptions || undefined),
    },
    xlsxSingle: {
      label: 'Excel', confirm: 'confirm.singleWorkbookExport', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressXlsx',
      noFile: 'status.exportErrorXlsx', done: 'status.singleWorkbookDone', doneWithFailures: 'status.singleWorkbookDoneWithFailures',
      splitDone: 'status.splitSingleWorkbookDone', splitDoneWithFailures: 'status.splitSingleWorkbookDoneWithFailures',
      single: true, fileSuffix: '-export.xlsx', grid: true, pageOptions: () => XlsxExport.pageOptionsFromLayout(),
      loadLibs: () => XlsxExport.ensureExcelLibLoaded(),
    },
  };

  // Les documents d'un export en lot, dans l'ordre : un par ligne, ou un par valeur d'une liste réglée « Un document par valeur » (js/list-split.js ;
  // un macro-modèle assemble ici le HTML de chaque ligne, gardé pour le rendu). Sans bulle réglée ainsi dans le modèle, ses en-têtes ni ses modèles,
  // rien n'est lu ni calculé de plus : un document par ligne, `variant` nul. Une ligne dont le plan échoue garde son document. Chaque document garde
  // sa `source` : le modèle qui le fait (voir ci-dessous).
  async function planExportJobs(rows, { tableId, sourceOf, templatesCache }) {
    const jobs = [];
    for (const row of rows) {
      const source = await sourceOf(row);
      if (!sourceMaySplit(source, templatesCache)) { jobs.push({ row, source, variant: null }); continue; }
      let rowHtml;
      let plan = null;
      try {
        rowHtml = await sourceRowHtml(source, tableId, row, templatesCache);
        plan = await ListSplit.plan(ListSplit.partsOf(rowHtml, source.headerFooterData), tableId, row);
      } catch (e) {
        console.error('[main] export en lot : plan « un document par valeur » impossible pour la ligne', row.id, e);
      }
      if (!plan) { jobs.push({ row, source, variant: null }); continue; }
      plan.variants.forEach(variant => jobs.push({ row, source, rowHtml, variant }));
    }
    return jobs;
  }

  // Ce qu'un export en lot lit du modèle qui fait le document d'une ligne, sa « source » : son HTML (pour un macro-modèle, sa composition, assemblée
  // ligne par ligne car le choix des annexes dépend des valeurs de chaque ligne, cf. MacroTemplates), ses en-têtes et pieds de page, ses marges (dans
  // l'unité du moteur de l'export), le nom de ses fichiers, son genre. Celle du modèle ouvert est lue une fois pour tout le lot ; sans « Modèle selon
  // la ligne » (js/row-template.js), toutes les lignes l'ont. Avec lui, une ligne que ses règles envoient vers un autre modèle a la source de ce
  // modèle (rowSourceResolver).
  function openTemplateSource(cfg) {
    const isMacro = currentTypeModele === 'macro';
    return {
      typeModele: currentTypeModele, isMacro, html: isMacro ? null : Editor.getHTML(), macroSlots: isMacro ? getCurrentMacroSlots() : null,
      headerFooterData: Editor.getHeaderFooterData(), filenameTemplate: getPdfFilenameTemplate(), margins: cfg.margins ? cfg.margins() : null, pageOptions: null,
    };
  }

  // La source d'un autre modèle de la liste, tel qu'il est enregistré : rien n'est chargé dans l'éditeur ni changé à l'écran. Sa page est lue par les
  // fonctions de l'écran (PageLayout borne les marges et les convertit) : posée le temps de la lecture et rendue aussitôt, sans `await` entre les
  // deux - ni l'une ni l'autre n'est jamais affichée. Ses en-têtes et pieds passent par l'export comme ceux de l'écran (leur HTML y est assaini).
  function templateSource(tpl, cfg) {
    const isMacro = tpl.typeModele === 'macro';
    const onScreen = PageLayout.getMarginsMm();
    let margins = null;
    let pageOptions = null;
    PageLayout.setMarginsMm(tpl.marginsMm);
    try {
      margins = cfg.margins ? cfg.margins() : null;
      pageOptions = cfg.pageOptions ? cfg.pageOptions() : null;
    } finally { PageLayout.setMarginsMm(onScreen); }
    return {
      typeModele: tpl.typeModele || 'document', isMacro, html: isMacro ? null : (tpl.contenu || ''), macroSlots: isMacro ? (tpl.macroSlots || { slots: [] }) : null,
      headerFooterData: tpl.headerFooter, filenameTemplate: String(tpl.nomFichierPDF || '').trim(), margins, pageOptions,
    };
  }

  // La source de chaque ligne d'un lot. Sans « Modèle selon la ligne » : celle du modèle ouvert, tout de suite, rien n'est lu de plus. Avec lui :
  // celle du modèle que ses règles donnent à cette ligne (RowTemplate.pick : les mêmes règles que quand la ligne s'ouvre à l'écran). Aucune ne la
  // désigne et le réglage garde le modèle ouvert, ou le modèle désigné est déjà ouvert : celui de l'écran, avec ce qu'il n'a pas encore enregistré.
  function rowSourceResolver(tableId, cfg, openSource) {
    if (!RowTemplate.isActive()) return async () => openSource;
    const byTemplate = new Map();
    return async row => {
      let id = null;
      try { id = await RowTemplate.pick(row, tableId); }
      catch (e) { console.error('[main] export en lot : modèle de la ligne impossible à choisir, celui de l’écran est gardé', row.id, e); }
      if (id == null || Templates.isCurrent(id)) return openSource;
      if (!byTemplate.has(id)) {
        const tpl = Templates.byId(id);
        byTemplate.set(id, tpl ? templateSource(tpl, cfg) : openSource);
      }
      return byTemplate.get(id);
    };
  }

  // Le HTML brut du document de cette ligne pour cette source (un macro-modèle : ses annexes, choisies avec les valeurs de la ligne).
  function sourceRowHtml(source, tableId, row, templatesCache) {
    return source.isMacro ? MacroTemplates.buildConcatenatedHtml(source.macroSlots, tableId, row, templatesCache) : source.html;
  }

  // Cette source peut-elle se découper en plusieurs documents (« Un document par valeur ») ? Sans bulle réglée ainsi dans le modèle, ses en-têtes ni
  // ses modèles (ceux de la liste, pour un macro-modèle), non : le plan n'est même pas calculé. Une fois par source.
  function sourceMaySplit(source, templatesCache) {
    if (source.maySplit === undefined) {
      const footerParts = ListSplit.partsOf('', source.headerFooterData).slice(1);
      source.maySplit = ListSplit.hasMarker(footerParts) || (source.isMacro ? templatesCache.some(tpl => ListSplit.hasMarker([tpl.contenu])) : ListSplit.hasMarker([source.html]));
    }
    return source.maySplit;
  }

  // Les lignes d'un export en lot : celles de la table (docApi, sans le filtre de vue), ou `only.record` seul. null : rien à exporter, le coin d'état
  // le dit.
  async function readBatchRows(cfg, tableId, only) {
    if (only) return [only.record];
    let rows;
    try { rows = await GristAPI.fetchTableRows(tableId); }
    catch (e) {
      console.error('[main] export ' + cfg.label + ' en lot : échec de lecture de la table', e);
      setStatus(exportText('status.cannotReadRows'), true);
      return null;
    }
    if (!rows.length) { setStatus(exportText('status.noRowsInTable', { table: tableId }), true); return null; }
    return rows;
  }

  // Au-delà de ce nombre de documents, l'export d'une seule ligne que « Un document par valeur » découpe demande d'abord (deux listes de 20
  // valeurs en font 400, deux de 100 en font 10 000, dans une archive construite en mémoire).
  const SPLIT_CONFIRM_FROM = 50;

  // L'accord avant un export en lot : `{}`, ou `{ layout }` pour les planches, qui se règlent dans leur propre fenêtre (feuille, emplacements, traits
  // de coupe) : elle tient lieu de confirmation. Un export seul n'en demande pas, son clic vaut accord, sauf quand sa ligne fait plus de
  // SPLIT_CONFIRM_FROM documents. null : la personne renonce.
  async function confirmBatch(cfg, { only, tableId, rowCount, jobCount, splitting }) {
    if (only) {
      if (jobCount <= SPLIT_CONFIRM_FROM) return {};
      const proceed = await Dialogs.confirm({ title: I18n.t('varList.split.label'), message: I18n.t('confirm.splitExport', { documents: jobCount }), confirmLabel: I18n.t('common.generate') });
      // « Génération en cours… » (exportRecordAs) ne doit pas rester affiché derrière un renoncement.
      if (!proceed) setStatus(I18n.t('status.exportCancelled'));
      return proceed ? {} : null;
    }
    if (cfg.sheets) return (await SheetAssemblyDialog.open({ count: jobCount, table: tableId, grid: GridEditor.isGridType(currentTypeModele) })) || null;
    const note = splitting ? '\n\n' + I18n.t('confirm.splitNote', { documents: jobCount }) : '';
    const proceed = await Dialogs.confirm({ title: exportText('dialog.batchExport.title'), message: exportText(cfg.confirm, { count: rowCount, table: tableId }) + note, confirmLabel: I18n.t('common.generate') });
    return proceed ? {} : null;
  }

  // Où un export en lot range ses documents : une archive ZIP (un fichier par document), un PDF unique (`merged`, ou `sheets` : posés sur des
  // planches) ou un classeur Excel unique (`single`). `add` reçoit le document tout prêt ; `finish` rend le fichier, `finishing` dit ce qui se passe
  // pendant ce temps. `sheetCount` ne se lit qu'une fois `finish` terminé.
  async function openBatchSink(cfg, tableId, sheetSetup) {
    if (cfg.single) {
      const workbook = await XlsxExport.createSingleWorkbook();
      return {
        add: doc => workbook.appendRecord(doc.html, tableId, doc.row, doc.source.filenameTemplate, doc.valueName, doc.source.pageOptions || undefined),
        finish: () => workbook.toBlob(),
        finishing: 'status.xlsxAssembling',
      };
    }
    const render = doc => cfg.renderRow(doc.html, tableId, doc.row, doc.source.filenameTemplate, doc.headerFooterData, doc.source.margins, doc.source.pageOptions);
    if (cfg.merged) {
      const pdf = await (cfg.sheets ? PdfMerge.createSheets(tableId, sheetSetup.layout) : PdfMerge.create(tableId));
      return {
        add: async doc => pdf.append((await render(doc)).blob),
        finish: () => pdf.toBlob(),
        finishing: cfg.sheets ? 'status.sheetsAssembling' : 'status.pdfMerging',
        sheetCount: () => (cfg.sheets ? pdf.sheetCount : 0),
      };
    }
    const zip = new JSZip();
    const usedNames = new Set();
    return {
      add: async doc => {
        const { blob, filename } = await render(doc);
        const base = (sanitizeFilenamePart(filename) || ('document-' + doc.row.id)) + (doc.valueName ? ' - ' + doc.valueName : '');
        zip.file(uniqueZipFilename(base, usedNames) + cfg.entryExt, blob);
      },
      finish: () => zip.generateAsync({ type: 'blob' }),
      finishing: 'status.zipCompressing',
    };
  }

  // `only` (facultatif) : la ligne courante seule - { record, plan, html } -, quand son document se découpe en plusieurs (« Un document par valeur »,
  // js/list-split.js) : une archive de ses documents, sans lire la table ni demander confirmation (le clic d'un export seul vaut accord), nommée
  // comme la ligne.
  async function onExportBatch(kind, only) {
    const cfg = BATCH_EXPORTS[kind];
    Editor.exitHeaderFooterModeIfActive();
    const tableId = currentTableId || GristAPI.getCurrentTableId();
    if (!tableId) { setStatus(I18n.t('status.currentTableNotFound'), true); return; }
    const rows = await readBatchRows(cfg, tableId, only);
    if (!rows) return;

    const { openSource, templatesCache, jobs, splitting } = await planBatchJobs(cfg, tableId, only, rows);
    const sheetSetup = await confirmBatch(cfg, { only, tableId, rowCount: rows.length, jobCount: jobs.length, splitting });
    if (!sheetSetup) return;

    // Ni JSZip ni le lot PDF ne sont chargés d'office au démarrage du widget : `JSZip` n'existe pas tant que ceci n'a pas été attendu au moins une
    // fois.
    setStatus(I18n.t(cfg.loading));
    try {
      await cfg.loadLibs();
    } catch (e) {
      console.error('[main] export ' + cfg.label + ' en lot : échec de chargement des bibliothèques', e);
      setStatus(I18n.t(cfg.loadError), true);
      return;
    }

    const sink = await openBatchSink(cfg, tableId, sheetSetup);
    const { ok, failed, cancelled } = await runBatchJobs(cfg, sink, jobs, { tableId, openSource, templatesCache });
    if (cancelled) { setStatus(I18n.t('status.exportCancelled')); return; }
    if (!ok) { setStatus(I18n.t(cfg.noFile), true); return; }

    await finishBatchExport(cfg, sink, { only, tableId, rows, openSource, splitting, ok, failed });
  }

  // Les documents à générer : un par ligne, ou un par valeur quand « Un document par valeur » découpe. Rend aussi ce que leur génération relit
  // (le modèle ouvert, le cache des modèles) et si l'un d'eux est un découpage.
  async function planBatchJobs(cfg, tableId, only, rows) {
    // Pas de HTML unique pour tout le lot : pour un macro-modèle, le choix des annexes dépend des valeurs de chaque ligne (cf. MacroTemplates), donc
    // la concaténation est refaite ligne par ligne dans la boucle de runBatchJobs ; un modèle normal garde le même gabarit pour toutes les lignes,
    // seule la résolution des #Variable change. Pas de modèle unique non plus quand « Modèle selon la ligne » est réglé : chaque ligne a la source
    // du modèle que ses règles lui donnent (rowSourceResolver), comme à l'écran.
    const templatesCache = Templates.getCached();
    const openSource = openTemplateSource(cfg);
    const sourceOf = only ? async () => openSource : rowSourceResolver(tableId, cfg, openSource);
    // Compté avant la confirmation : « Un document par valeur » fait plus de documents que de lignes.
    const jobs = only ? only.plan.variants.map(variant => ({ row: only.record, source: openSource, rowHtml: only.html, variant }))
      : await planExportJobs(rows, { tableId, sourceOf, templatesCache });
    const splitting = jobs.some(job => ListSplit.hasPins(job.variant));
    return { openSource, templatesCache, jobs, splitting };
  }

  // Génère les documents un par un dans `sink`. cancelled : « Annuler » sur la fenêtre des images d'un site externe a arrêté tout le lot ;
  // failed : les lignes que leur modèle ou une erreur a empêché de générer.
  async function runBatchJobs(cfg, sink, jobs, { tableId, openSource, templatesCache }) {
    let ok = 0;
    let failed = 0;
    let cancelled = false;
    for (let i = 0; i < jobs.length; i++) {
      const { row, variant, source } = jobs[i];
      setStatus(I18n.t(cfg.progress, { current: i + 1, total: jobs.length }));
      // Le modèle d'une ligne (« Modèle selon la ligne ») peut ne pas être du genre de cet export - une grille en Word, un document en Excel : la
      // ligne n'est pas générée, comme celle qui échoue.
      if (source !== openSource && cfg.grid != null && cfg.grid !== GridEditor.isGridType(source.typeModele)) {
        console.error('[main] export ' + cfg.label + ' en lot : le modèle de la ligne ' + row.id + ' (' + source.typeModele + ') ne se génère pas dans ce format');
        failed++;
        continue;
      }
      try {
        // Le document de cette valeur : les bulles réglées « Un document par valeur » y écrivent leur k-ième valeur (js/list-split.js) ; sans
        // découpage, le HTML et les en-têtes sont ceux de la ligne, tels quels.
        const html = ListSplit.pin(jobs[i].rowHtml !== undefined ? jobs[i].rowHtml : await sourceRowHtml(source, tableId, row, templatesCache), variant);
        await sink.add({
          row, source, html, headerFooterData: ListSplit.pinHeaderFooter(source.headerFooterData, variant),
          valueName: variant && variant.label ? sanitizeFilenamePart(variant.label) : '',
        });
        ok++;
      } catch (e) {
        // « Annuler » sur la fenêtre des images d'un site externe arrête tout le lot, pas seulement cette ligne : rien n'est téléchargé.
        if (ExternalImages.isCancel(e)) { cancelled = true; break; }
        console.error('[main] export ' + cfg.label + ' en lot : échec pour la ligne', row.id, e);
        failed++;
      }
    }
    return { ok, failed, cancelled };
  }

  // La fin d'un export en lot : le fichier assemblé est téléchargé, le coin d'état dit combien de documents (et de planches) il contient.
  async function finishBatchExport(cfg, sink, { only, tableId, rows, openSource, splitting, ok, failed }) {
    setStatus(I18n.t(sink.finishing));
    const outBlob = await sink.finish();
    // Archive d'un export seul : nommée comme la ligne ; sinon comme la table.
    const outBase = only ? (sanitizeFilenamePart(await ReaderMode.resolveFilename(openSource.filenameTemplate, tableId, rows[0])) || sanitizeFilenamePart(tableId)) : sanitizeFilenamePart(tableId);
    ExportCommon.downloadBlob(outBlob, outBase + cfg.fileSuffix);
    const sheets = sink.sheetCount ? sink.sheetCount() : 0;
    const useSplitTexts = splitting && cfg.splitDone;
    const doneKey = failed ? (useSplitTexts ? cfg.splitDoneWithFailures : cfg.doneWithFailures) : (useSplitTexts ? cfg.splitDone : cfg.done);
    setExportDoneStatus(exportText(doneKey, { ok, failed, sheets }));
  }

  async function switchMode(mode) {
    // Lecture seule : le mode Lecture est le seul accessible, y compris depuis la dernière ligne d'init().
    if (isReadOnly()) mode = 'read';
    // La Lecture épurée (js/clean-reading.js) n'existe que dans le mode Lecture : un autre mode la quitte, la barre du haut revient avec lui.
    CleanReading.onModeChange(mode);
    if (mode === 'read') Editor.exitHeaderFooterModeIfActive();
    currentMode = mode;
    applyFormattingBarLock();
    applyCommentsPermissions();
    btnEdit.classList.toggle('active', mode === 'edit');
    btnRead.classList.toggle('active', mode === 'read');
    syncEditorVisibilityForMode();
    readerContainer.style.display = mode === 'read' ? 'block' : 'none';
    if (mode === 'read') await renderReader(latestRecord || GristAPI.getCurrentRecord(), latestRecordTableId || GristAPI.getCurrentTableId());
    await updateEmailFieldsDisplay();
    await updateEmailLengthGauge();
  }

  // Classe posée sur les deux conteneurs (édition et lecture) : la largeur réelle d'une page PDF doit aussi s'appliquer en mode Lecture. `.checked`
  // sur le <label> lui-même garde l'icône en accent tant que la case est cochée. Une grille n'a pas de feuille : la case est alors grisée
  // (GridEditor.setActive) et la classe retirée, la case gardant sa valeur pour le modèle suivant.
  function applyA4Preview() {
    const toggle = document.getElementById('v2-toggle-a4-preview');
    if (!toggle) return;
    const label = toggle.closest('.a4-toggle');
    const on = toggle.checked && !GridEditor.isGridType(currentTypeModele);
    editorContainer.classList.toggle('a4-preview', on);
    readerContainer.classList.toggle('a4-preview', on);
    if (label) label.classList.toggle('checked', toggle.checked);
    // Le facteur d'ajustement n'a de sens qu'en Aperçu A4 : applyPageFitZoom le retire de lui-même quand la classe disparaît. Avant la pagination,
    // qui mesure le rendu réel et serait sinon calculée avec l'ancien facteur.
    refreshPageFitZoom();
    Editor.refreshPaginationPreview();
    recaptureStaleLayerGrids();
  }

  // Rappelée à chaque changement de modèle (loadTemplateIntoEditor, loadMacroIntoEditor) : seul le passage d'une grille à un autre type (ou
  // l'inverse) change la classe, dans tous les autres cas la case seule la gouverne.
  let a4ForcedOffByGrid = false;
  function syncA4PreviewForModelType() {
    const grid = GridEditor.isGridType(currentTypeModele);
    if (grid === a4ForcedOffByGrid) return;
    a4ForcedOffByGrid = grid;
    applyA4Preview();
  }

  function wireA4PreviewToggle() {
    const toggle = document.getElementById('v2-toggle-a4-preview');
    if (!toggle) return;
    toggle.addEventListener('change', applyA4Preview);
    applyA4Preview();
  }

  // Nom de fichier PDF masqué par défaut derrière un crayon : réglage secondaire, pas besoin d'occuper en permanence une zone de la barre du haut.
  // Reste visible si déjà configuré (cf. loadTemplateIntoEditor).
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

  // Qualité PDF : bouton + panneau au survol plutôt qu'un <select> toujours affiché. Seul le vectoriel existe : l'export ne lit plus la valeur
  // choisie, les autres lignes sont grisées (« bientôt »).
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

  // Ajustement de la page à la largeur disponible (cf. la règle `zoom` de css/editor-v2.css) : réduit la feuille juste ce qu'il faut pour
  // qu'elle tienne dans le conteneur, jamais au-delà de 1 (une page A4 n'a pas à grossir sur un grand écran) et jamais en dessous de 0,5,
  // sous lequel le texte deviendrait illisible ; le défilement horizontal reprend alors la main. Quand la feuille tient déjà, le facteur vaut 1 et
  // rien ne change. C'est l'affichage d'origine : js/page-zoom.js (factorFor) calcule ce facteur et le remplace par le niveau que la personne a
  // choisi (pastille de zoom, Ctrl + molette, « Ajuster »), le même pour l'éditeur et la Lecture.
  function applyPageFitZoom(container) {
    if (!container) return;
    if (!container.classList.contains('a4-preview')) { container.style.removeProperty('--pp-fit-zoom'); return; }
    const zoom = PageZoom.factorFor(container);
    if (zoom == null) return;
    // Arrondi au millième : sans ça, un redimensionnement continu réécrit la variable à chaque pixel et relance la pagination en boucle.
    const next = String(Math.round(zoom * 1000) / 1000);
    if (container.style.getPropertyValue('--pp-fit-zoom') === next) return;
    container.style.setProperty('--pp-fit-zoom', next);
    return true;
  }

  // Pose le facteur sur les deux conteneurs sans rien rafraîchir, pour les appelants qui rafraîchissent eux-mêmes juste après (chargement d'un
  // modèle, changement d'orientation). Rend true si l'un des deux a changé.
  function applyPageFitZoomToBoth() {
    const editorChanged = applyPageFitZoom(editorContainer);
    const readerChanged = applyPageFitZoom(readerContainer);
    return !!(editorChanged || readerChanged);
  }

  function refreshPageFitZoom() {
    const editorChanged = applyPageFitZoom(editorContainer);
    const readerChanged = applyPageFitZoom(readerContainer);
    // Les bandes de pagination sont positionnées à partir de mesures réelles : un changement de facteur les rend caduques tant qu'on n'a pas
    // recalculé.
    if (editorChanged && currentMode === 'edit') Editor.refreshPaginationPreview();
    if (readerChanged && currentMode === 'read') renderReader();
  }

  // Vrai quand l'orientation ou le format a changé à un moment où l'éditeur ne pouvait pas mesurer sa mise en page - masqué (Lecture, résumé d'un
  // macro-modèle) ou sans Aperçu A4 (pas de pagination, donc pas de grille page) : la grille page des images en calque reste à recapturer (cf.
  // onPageLayoutChanged).
  let layerGridsStale = false;
  // Recapture en attente, dès que l'éditeur peut la mesurer (retour en Édition, Aperçu A4 rallumé). Elle vient d'un geste de la personne (le
  // changement d'orientation ou de format) : si elle a modifié le document, l'enregistrement automatique la reprend - un enregistrement a pu partir
  // entre-temps.
  function recaptureStaleLayerGrids() {
    if (!layerGridsStale || currentMode !== 'edit' || currentTypeModele === 'macro' || !editorContainer.classList.contains('a4-preview')) return;
    layerGridsStale = false;
    if (HeaderFooterPreview.recaptureLayeredImageGrids()) markAutosaveDirty();
  }
  // Après un changement d'orientation ou de format : le facteur d'ajustement (calculé sur la largeur de la page) d'abord, puis tout ce qui se mesure
  // avec lui - colonnes des tableaux et pagination de l'éditeur, repagination de la Lecture. Les marges gardent leurs millimètres : seule la page
  // change de forme.
  function onPageLayoutChanged() {
    applyPageFitZoomToBoth();
    Editor.refreshLayout();
    // La page a changé de hauteur : la grille page de chaque image en calque (lue par le PDF et le Word) est recapturée sur le rendu réel de
    // l'éditeur. Masqué (Lecture) ou sans Aperçu A4, il n'a pas de mise en page à mesurer : la recapture attend qu'il le puisse
    // (syncEditorVisibilityForMode, wireA4PreviewToggle).
    layerGridsStale = true;
    recaptureStaleLayerGrids();
    if (currentMode === 'read') renderReader();
  }

  // Le filigrane (fenêtre « Filigrane… » du menu Page) est peint par la couche de page de l'éditeur (Aperçu A4) et de la Lecture : la page garde sa
  // taille, seule la couche est repeinte. Un macro-modèle n'a pas d'éditeur à repeindre (son résumé n'a pas de page) : sa Lecture, son PDF et son
  // Word relisent le réglage.
  function onWatermarkChanged() {
    if (currentMode === 'read') renderReader();
    else if (currentTypeModele !== 'macro') Editor.refreshPaginationPreview();
  }

  function wirePageFitZoom() {
    // La pastille de zoom (js/page-zoom.js) change le facteur sans que le conteneur change de taille : les bandes de pagination, mesurées sur l'ancien
    // rendu, se refont ici - celles de l'éditeur, ou la Lecture.
    PageZoom.wire({
      apply: applyPageFitZoomToBoth,
      refresh: () => (currentMode === 'read' ? renderReader() : Editor.refreshPaginationPreview()),
      template: () => ({ id: Templates.getCurrentId(), name: templateNameInput ? templateNameInput.value.trim() : '' }),
    });
    refreshPageFitZoom();
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => refreshPageFitZoom());
      if (editorContainer) ro.observe(editorContainer);
      if (readerContainer) ro.observe(readerContainer);
    } else {
      window.addEventListener('resize', refreshPageFitZoom);
    }
  }

  // Ctrl+S / Cmd+S : enregistre le modèle courant exactement comme le bouton Enregistrer (même onSave, donc mêmes contrôles : nom obligatoire, sortie
  // du mode en-tête/pied). Posé en capture sur `document` pour marcher où que soit le focus (éditeur, champ de nom, aperçu), avec preventDefault :
  // sinon le navigateur ouvre sa propre boîte « Enregistrer la page », y compris dans l'iframe du widget. Neutralisé pendant qu'une fenêtre est
  // ouverte : Ctrl+S y enregistrerait un modèle que la personne est justement en train de remplacer.
  // Les autres touches du widget, et celle-ci une fois changée dans Réglages > Raccourcis, relèvent de js/shortcuts.js : chargé plus tôt dans la même
  // phase de capture, il passe avant ce gestionnaire et arrête Ctrl+S quand la touche d'Enregistrer a changé.
  function wireSaveShortcut() {
    const anyModalOpen = () => Array.prototype.some.call(
      document.querySelectorAll('#link-rules-modal, #link-config-modal, #template-gallery-modal, #template-preview-modal, #settings-modal, #template-organize-modal'),
      m => m.style.display && m.style.display !== 'none');
    document.addEventListener('keydown', (event) => {
      if (event.key !== 's' && event.key !== 'S') return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (anyModalOpen()) return;
      event.preventDefault();
      onSave();
    }, true);
  }

  // Le libellé du raccourci dépend de la plateforme (⌘S sur macOS, Ctrl+S ailleurs) et de la touche choisie dans Réglages > Raccourcis
  // (js/shortcuts.js ; '' quand elle a été retirée) : impossible à écrire dans index.html. Posé sur le titre du menu du bouton Enregistrer (qui
  // remplace son info-bulle : un bouton à menu n'a pas de data-tip, les deux se superposeraient) et sur son aria-label. Réappliqué à chaque
  // changement de langue et de touche, sinon I18n.applyTranslations() le réécrirait sans le raccourci.
  function decorateSaveButtonShortcut() {
    const btn = document.getElementById('btn-save');
    if (!btn) return;
    const key = Shortcuts.label('save');
    const label = key ? `${I18n.t('toolbar.save')} (${key})` : I18n.t('toolbar.save');
    btn.setAttribute('aria-label', label);
    const menuTitle = document.getElementById('v2-save-flyout-label');
    if (menuTitle) menuTitle.textContent = label;
  }

  // Les fenêtres écrites dans index.html sont reprises par la base commune des fenêtres (js/modal-base.js) : Tab et Échap tenus dans la fenêtre du
  // dessus où que soit le focus, focus à l'ouverture et rendu à l'élément d'origine à la fermeture. Leur module les ouvre et les ferme par
  // style.display ; Échap clique le bouton qui les ferme (le second nom de chaque paire), donc passe par la même sortie que la souris.
  function wirePageModals() {
    [
      ['link-rules-modal', 'link-rules-close'],
      ['link-config-modal', 'link-config-cancel'],
      ['template-gallery-modal', 'tpl-gallery-close'],
      ['template-preview-modal', 'tpl-preview-close'],
      ['settings-modal', 'settings-close'],
      ['macro-editor-modal', 'macro-editor-cancel'],
      ['template-organize-modal', 'template-organize-close'],
    ].forEach(([id, closeId]) => ModalBase.adopt(id, { closeId }));
  }

  // "Tables liées" (js/variables.js) : modale séparée, rafraîchit la liste à chaque ouverture (une règle a pu être ajoutée entre-temps via
  // l'insertion d'une variable).
  function wireLinkRulesModal() {
    const btn = document.getElementById('btn-link-rules');
    const modal = document.getElementById('link-rules-modal');
    const btnClose = document.getElementById('link-rules-close');
    if (!btn || !modal || !btnClose) return;
    btn.addEventListener('click', () => { Variables.refreshLinkRulesPanel(); modal.style.display = 'flex'; });
    btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
  }

  // Galerie de modèles : l'aperçu en lecture seule est une simple reconstruction DOM passive (innerHTML dans un conteneur .tiptap), pas une seconde
  // instance TipTap, donc sans risque pour le document en cours d'édition.
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
        previewTiptap.innerHTML = HtmlSanitize.clean(currentHtml);
      } catch (e) {
        console.error('[main] galerie de templates : échec du chargement du template', e);
        setStatus(I18n.t('status.templateLoadError'), true);
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
      templateSelect.value = '';
      loadTemplateIntoEditor({ id: null, contenu: html, headerFooter, nom: currentEntry.name, nomFichierPDF: '' });
      await onSave();
      closeAll();
    }

    async function useEmpty() {
      if (!currentEntry || !currentHtml) return;
      // Le nouveau modèle remplace l'éditeur : même question que pour un changement de modèle (« Annuler » laisse la galerie ouverte, rien n'est
      // créé).
      if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return;
      await saveEntryAsTemplate(TemplateGallery.stripVariableBadges(currentHtml));
      setStatus(I18n.t('status.templateSavedAsNew', { name: savedTemplateName(currentEntry.name) }));
    }

    async function useWithData() {
      if (!currentEntry || !currentHtml) return;
      // Avant tout effet (la table Grist n'est créée qu'après) : « Annuler » ne laisse rien derrière elle.
      if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return;
      let schema;
      try { schema = await TemplateGallery.fetchSchema(currentEntry); }
      catch (e) {
        console.error('[main] galerie de templates : échec du chargement du schéma', e);
        setStatus(I18n.t('status.schemaLoadError'), true);
        return;
      }
      if (!schema || !schema.columns.length) { setStatus(I18n.t('status.noColumnsDefined'), true); return; }
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
        console.error('[main] galerie de templates : échec de la création de la table', e);
        setStatus(I18n.t('status.tableCreationError', { table: tableName }), true);
        return;
      }
      await saveEntryAsTemplate(TemplateGallery.rebindVariableTable(currentHtml, schema.tableName, actualTableId));
      setStatus(I18n.t('status.tableCreatedSummary', { table: actualTableId, count: schema.columns.length, name: savedTemplateName(currentEntry.name) }));
    }

    openLink.addEventListener('click', openGallery);
    if (galleryClose) galleryClose.addEventListener('click', closeAll);
    if (previewCloseBtn) previewCloseBtn.addEventListener('click', closeAll);
    if (previewBack) previewBack.addEventListener('click', () => { previewModal.style.display = 'none'; galleryModal.style.display = 'flex'; });
    if (searchInput) searchInput.addEventListener('input', renderGrid);
    // Un seul « Utiliser… » à la fois : avec Grist lent, rien ne bouge à l'écran et la personne clique une deuxième fois, ce qui créerait un second
    // modèle (« Facture » puis « Facture (2) ») ou, sur « Utiliser avec une nouvelle table de données », rouvrirait la fenêtre du nom avant la fin de
    // la première création. Le clic en trop est ignoré tant que la première création n'est pas finie ; une création qui ne revient jamais ne bloque
    // pas les boutons au-delà de SAVE_WATCHDOG_MS.
    let useStartedAt = 0; // 0 : aucune création en cours
    const once = (action) => async function () {
      if (useStartedAt && Date.now() - useStartedAt < SAVE_WATCHDOG_MS) return;
      const startedAt = useStartedAt = Date.now();
      try { await action(); } finally { if (useStartedAt === startedAt) useStartedAt = 0; }
    };
    previewUseEmpty.addEventListener('click', once(useEmpty));
    previewUseData.addEventListener('click', once(useWithData));
  }

  // Tout ce qui marque le brouillon « modifié » ou rafraîchit la jauge de l'email : l'éditeur, les champs du modèle et les réglages de page.
  function wireEditTracking() {
    // 'update' et non 'transaction' : ne part que si le document a réellement changé (docChanged), jamais pour un simple déplacement du curseur ou de
    // la sélection (cf. la section Enregistrement automatique plus haut). Couvre aussi l'édition de l'en-tête et du pied (même instance d'éditeur,
    // contenu échangé par setContent).
    EditorCore.getEditor().on('update', markAutosaveDirty);
    EditorCore.getEditor().on('update', scheduleEmailLengthGauge);
    if (templateNameInput) templateNameInput.addEventListener('input', markAutosaveDirty);
    if (pdfFilenameInput) pdfFilenameInput.addEventListener('input', markAutosaveDirty);
    eachEmailInput(el => {
      el.addEventListener('input', markAutosaveDirty);
      el.addEventListener('input', scheduleEmailLengthGauge);
      // Même mécanisme #Variable que le champ « nom de fichier PDF » (texte brut, cf. le commentaire CSS de #v2-email-fields-row), sans suggestion de
      // chips (setTabsVisible(false) dans checkForFilenameTrigger) : une note de bas de page, une date ou une heure n'a aucun sens dans un objet ou
      // une liste d'adresses.
      Variables.initFilenameInput(el);
    });
    wireCciToggle();
    // Émis par js/settings.js à chaque saisie dans les quatre champs de marge (onglet Réglages) : changer seulement les marges ne touche pas au
    // texte, et sans cet évènement le brouillon ne serait jamais marqué « modifié ».
    document.addEventListener('pp:marginsChanged', markAutosaveDirty);
    // Émis par PageLayout.setOrientation (bouton Portrait / Paysage) : la feuille change de largeur et de hauteur. Le bouton ne rafraîchit rien
    // lui-même.
    document.addEventListener('pp:pageLayoutChanged', onPageLayoutChanged);
    // Émis par PageLayout.setWatermark (fenêtre « Filigrane… ») : la couche des pages est repeinte, la page ne change pas de forme.
    document.addEventListener('pp:watermarkChanged', onWatermarkChanged);
  }

  // La ligne sélectionnée dans Grist a changé : la Lecture, les champs de l'email et la jauge suivent.
  async function onRecordChange(record, tableId) {
    latestRecord = record;
    latestRecordTableId = tableId || GristAPI.getCurrentTableId();
    if (tableId) currentTableId = tableId;
    // Réglage « Modèle selon la ligne » coupé (le cas général) : un test, rien d'autre. Activé et le modèle de la ligne change :
    // loadTemplateIntoEditor a déjà redessiné la Lecture.
    const switched = await RowTemplate.follow(record, latestRecordTableId);
    if (currentMode === 'read' && record && !switched) await renderReader(record, latestRecordTableId);
    if (currentMode === 'read') await updateEmailFieldsDisplay();
    await updateEmailLengthGauge();
  }

  // Les boutons de la barre : nouveau modèle, import, suppression, exports, création de l'email, modes Édition et Lecture.
  function wireToolbarButtons() {
    document.getElementById('btn-new').addEventListener('click', onNew);
    const btnNewDocument = document.getElementById('v2-btn-new-document');
    const btnNewEmail = document.getElementById('v2-btn-new-email');
    const btnNewMacro = document.getElementById('v2-btn-new-macro');
    const btnNewGrid = document.getElementById('v2-btn-new-grid');
    if (btnNewDocument) btnNewDocument.addEventListener('click', onNew);
    if (btnNewEmail) btnNewEmail.addEventListener('click', onNewEmail);
    if (btnNewMacro) btnNewMacro.addEventListener('click', onNewMacro);
    if (btnNewGrid) btnNewGrid.addEventListener('click', onNewGrid);
    const btnImportXlsx = document.getElementById('v2-btn-import-xlsx');
    if (btnImportXlsx) btnImportXlsx.addEventListener('click', onImportXlsx);
    MacroEditor.wire(onMacroSaved, macroSettingsOnScreen, openTemplateFromMacro, onMacroModelVisibility);
    TemplateOrganizeModal.wire();
    document.getElementById('btn-delete').addEventListener('click', onDelete);
    document.getElementById('btn-export-pdf').addEventListener('click', withExportLock(onExportPdf));
    // Fonctions fléchées : sans elles, l'événement click arriverait comme premier argument (`merged`) et serait lu comme vrai.
    document.getElementById('v2-btn-export-pdf-batch').addEventListener('click', withExportLock(() => onExportBatch('pdfZip')));
    document.getElementById('v2-btn-export-pdf-merged').addEventListener('click', withExportLock(() => onExportBatch('pdfMerged')));
    document.getElementById('v2-btn-export-pdf-sheets').addEventListener('click', withExportLock(() => onExportBatch('pdfSheets')));
    // Une ligne grisée du menu (syncExportRowsForModelType) ne lance rien : la classe ne bloque pas le clic à elle seule.
    const onExportRow = (id, handler) => document.getElementById(id).addEventListener('click', e => { if (!e.currentTarget.classList.contains('v2-hover-row-disabled')) handler(); });
    onExportRow('v2-btn-export-docx', withExportLock(onExportDocx));
    onExportRow('v2-btn-export-docx-batch', withExportLock(() => onExportBatch('docxZip')));
    onExportRow('v2-btn-export-xlsx', withExportLock(onExportXlsx));
    onExportRow('v2-btn-export-xlsx-batch', withExportLock(() => onExportBatch('xlsxZip')));
    onExportRow('v2-btn-export-xlsx-single', withExportLock(() => onExportBatch('xlsxSingle')));
    if (btnCreateEmail) btnCreateEmail.addEventListener('click', withExportLock(onCreateEmail));
    btnEdit.addEventListener('click', () => switchMode('edit'));
    btnRead.addEventListener('click', () => switchMode('read'));
  }

  // Le reste des branchements de l'interface : Lecture épurée, fenêtres, nom du fichier PDF, qualité, raccourcis, bandeau de conflit, menu
  // Enregistrer.
  function wireWidgetControls() {
    CleanReading.wire({
      getMode: () => currentMode,
      switchMode,
      // Le curseur revient dans l'éditeur à l'endroit où il était, sans faire défiler le document.
      focusEditor: () => { const editor = EditorCore.getEditor(); if (editor && editor.isEditable) editor.commands.focus(null, { scrollIntoView: false }); },
    });
    wireA4PreviewToggle();
    OrientationToggle.wire({ isReadOnly });
    wireLinkRulesModal();
    wireTemplateGalleryModal();
    wireTemplateRename();
    wireDefaultTemplateButton();
    wirePdfFilenameToggle();
    wireQualityDropdown();
    Settings.wireSettingsModal();
    RowTemplatePanel.wire();
    ViewTemplate.wirePanel();
    wirePageModals();
    wireSaveShortcut();
    wirePageFitZoom();
    decorateSaveButtonShortcut();
    I18n.onChange(decorateSaveButtonShortcut);
    Shortcuts.onChange(decorateSaveButtonShortcut);
    // Le message « Modifications non enregistrées » dure tant que rien n'est enregistré : il suit un changement de langue au lieu de rester dans
    // l'ancienne.
    I18n.onChange(() => { if (statusMsg.classList.contains('is-unsaved')) statusMsg.textContent = I18n.t('status.unsavedChanges'); });
    Variables.initFilenameInput(pdfFilenameInput);
    wireAutosaveConflictBanner();
    wirePasteTooBigNotice();
    wireMacroReturn();
    wireSaveMenu();
  }

  // Une fois le modèle affiché : la lecture exacte du schéma, puis les renommages et les réglages qui citent une colonne disparue.
  function checkAfterOpen() {
    // L'ouverture n'a lu que les métadonnées des tables (colonnes provisoires, GristAPI.init) : une passe lue il y a moins d'une minute - celle de
    // l'affichage du premier modèle - suffit, sinon elle part ici.
    setTimeout(() => { GristAPI.refreshSchema({ maxAgeMs: 60000 }).catch(() => {}); }, EXACT_SCHEMA_CHECK_MS);
    // Les renommages faits dans Grist depuis la dernière ouverture (js/schema-renames.js) : une fois le modèle affiché, sans l'attendre. Puis les
    // réglages Accès et Selon la ligne qui citent une colonne disparue (js/settings-columns.js), qui passent après : le coin d'état n'a qu'une ligne,
    // et l'avertissement, qui demande une action, se lit en premier ; « Mis à jour après un renommage… » le suit au lieu d'être effacé (message
    // entier au survol, js/viewport-fit.js).
    const untouched = () => !hasEditsToConfirmBeforeLeaving();
    let renamedMessage = '';
    SchemaRenames.checkAfterOpen({ isUntouched: untouched, notify: msg => { renamedMessage = msg; setStatus(msg); } })
      .catch(e => console.warn('[main] suivi des renommages impossible', e))
      .then(() => SettingsColumns.checkAfterOpen({ isUntouched: untouched, notify: (msg, isError) => setStatus(renamedMessage ? msg + ' ' + renamedMessage : msg, isError) }))
      .catch(e => console.warn('[main] vérification des réglages impossible', e));
  }

  async function init() {
    FirstContact.start(); // widget ouvert hors de Grist, adresse bloquée par le réseau, démarrage trop long : js/first-contact.js
    syncSaveButtonLook();
    wireAccessLockGuard();
    // Grist (schéma, règles de liaison), les modèles et l'éditeur se chargent ensemble : en série, leurs aller-retour et leurs téléchargements
    // faisaient attendre 6 s le premier modèle. index.html a pu les lancer plus tôt encore (window.__earlyStart), pendant que les derniers scripts
    // arrivent.
    const early = window.__earlyStart || {};
    const gristInit = early.grist || GristAPI.init();
    const templatesLoaded = early.templates || Templates.loadAll();
    const editorReady = Editor.init();
    editorReady.catch(() => {}); // l'échec se lit plus bas, à l'attente ; ici seulement pas d'« unhandled rejection » le temps que Grist réponde
    try { await gristInit; } catch (e) { setStatus(I18n.t('status.gristApiError'), true); }
    // Lancé dès que les options du widget sont connues (GristAPI.init), attendu seulement avant le premier affichage, en fin d'init().
    const accessReady = AccessRights.init();
    ViewTemplate.init();
    RowTemplate.init({
      openTemplate: openTemplateForRow,
      currentId: () => Templates.getCurrentId(),
      currentRecord: () => ({ record: latestRecord, tableId: latestRecordTableId }),
    });
    await editorReady;
    Comments.setReaderHooks({ save: saveReaderCommentAnchors, refresh: () => renderReader() });
    Comments.wireReader(readerContainer);
    wireEditTracking();
    GristAPI.onRecord(onRecordChange);
    await refreshTemplateList(templatesLoaded);
    // Enveloppe #template-select avant l'écriture de templateSelect.value ci-dessous (modèle par défaut) : TemplateTreeSelect intercepte cet
    // accesseur pour se synchroniser (js/template-tree-select.js), donc l'ordre importe ; attaché après, le premier affichage du modèle par défaut
    // serait manqué.
    // Le try/catch garde le reste du démarrage : init() n'a ailleurs aucun filet, et une exception dans cette vue décorative empêcherait de brancher
    // tout ce qui suit (Enregistrer, Ctrl+S, enregistrement automatique, statut « Prêt ») sans aucun message. Un bug de rendu de l'arbre doit rester
    // dans l'arbre.
    // `onOrganize` : « Organiser mes modèles » vit dans l'en-tête du panneau (js/template-tree-select.js).
    try { TemplateTreeSelect.attach(templateSelect, { onOrganize: () => { if (!isReadOnly()) TemplateOrganizeModal.open(); } }); } catch (e) { console.error('[main] TemplateTreeSelect.attach a échoué, arbre non disponible', e); }
    // Chargement non bloquant, comme Comments.loadForTemplate ci-dessous : l'identification de la personne (GristAPI.getCurrentUserEmail) est un
    // aller-retour réseau qui ne doit pas retarder le démarrage pour la section « Épinglés » de l'arbre.
    TemplatePreferences.loadForCurrentUser()
      .then(() => TemplateTreeSelect.refresh())
      .catch(e => console.error('[main] chargement des préférences de rangement impossible', e));
    // Modèle par défaut (cf. btn-set-default-template) : sélectionné avant la lecture de templateSelect.value ci-dessous, pour que le widget s'ouvre
    // directement dessus plutôt que sur "-- Nouveau modèle --". Silencieux si l'id ne correspond à aucune option (modèle supprimé entre-temps).
    // Réglage « Modèle selon la ligne » activé et la ligne déjà connue : le widget s'ouvre directement sur son modèle, sans passer par le modèle par
    // défaut.
    let startupRowTemplateId = null;
    if (RowTemplate.isActive() && latestRecord) {
      try { startupRowTemplateId = await RowTemplate.pick(latestRecord, latestRecordTableId); }
      catch (e) { console.error('[main] modèle de la ligne introuvable au démarrage', e); }
    }
    // Ordre d'ouverture : la ligne qui désigne un modèle, puis le modèle choisi pour cette vue (js/view-template.js), puis le modèle par défaut du
    // document (★, jamais un modèle email ou macro : Templates.getDefaultId les ignore, même quand la colonne les marque encore).
    const startupTemplateId = [startupRowTemplateId, ViewTemplate.usableId(), Templates.getDefaultId()].find(id => id != null);
    if (startupTemplateId !== undefined) templateSelect.value = startupTemplateId;
    await onTemplateSelectChange();
    templateSelect.addEventListener('change', onTemplateSelectChange);
    // Les lignes reçues avant ce point (modèles pas encore chargés) comptent maintenant ; la ligne déjà ouverte au démarrage ne rouvre rien.
    RowTemplate.start().catch(e => console.error('[main] modèle selon la ligne non appliqué', e));
    wireToolbarButtons();
    wireWidgetControls();
    startAutosaveLoop();
    await Promise.race([accessReady, new Promise(resolve => setTimeout(resolve, ACCESS_STARTUP_WAIT_MS))]);
    applyAccessRights();
    AccessRights.onChange(onAccessRightsChange);
    await switchMode('edit');
    FirstContact.ready();
    setStatus(I18n.t(isReadOnly() ? 'status.readyReadOnly' : 'status.ready'));
    openCleanReadingForReadOnly();
    checkAfterOpen();
  }

  // Dernier filet de init() : hors TemplateTreeSelect.attach() (cf. ci-dessus), une exception interromprait l'initialisation en silence, sa seule
  // trace étant la console. Elle s'affiche ici dans le coin d'état.
  init().catch((e) => {
    console.error('[main] init() a échoué', e);
    setStatus(I18n.t('status.initError', { message: (e && e.message) || String(e) }), true);
    FirstContact.failed(e);
  });
})();
