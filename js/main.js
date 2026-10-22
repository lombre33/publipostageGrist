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
  // Le document d'où le modèle Grille à l'écran a été ouvert par « Ouvrir le modèle » (menu du lien d'un tableau lié, js/linked-table.js), et ce qu'il faut pour y revenir : { templateId,
  // modelId, place (la case du curseur dans le tableau), macroOrigin (celui du document, rendu au retour) }, null sinon (cf. openLinkedModel).
  let linkedOrigin = null;
  // Valeurs brutes (gabarits #Variable) des quatre champs, capturées juste avant de passer en Lecture : la Lecture affiche les valeurs résolues dans
  // les mêmes champs, sans zone en double. Non nul seulement pendant la Lecture (cf. updateEmailFieldsDisplay).
  let emailFieldsRawCache = null;

  const statusMsg = document.getElementById('status-msg');
  const templateSelect = document.getElementById('template-select');
  const templateNameInput = document.getElementById('template-name');
  const pdfFilenameInput = document.getElementById('pdf-filename-template');
  const editorContainer = document.getElementById('editor-container');
  const readerContainer = document.getElementById('reader-container');
  const macroSummaryContainer = document.getElementById('macro-summary-container');
  const accessGuideContainer = document.getElementById('access-guide-container');
  const btnEdit = document.getElementById('btn-mode-edit');
  const btnRead = document.getElementById('btn-mode-read');
  const conflictBanner = document.getElementById('autosave-conflict-banner');
  const conflictReloadBtn = document.getElementById('autosave-conflict-reload');
  const macroReturnBar = document.getElementById('macro-return-bar');
  const linkedReturnBar = document.getElementById('linked-return-bar');
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

  // Les quatre champs de l'email : leur clé, la même dans les réglages du modèle et dans les valeurs résolues, et leur champ (un champ texte à bulles,
  // js/field-editor.js : l'élément se lit et s'écrit comme un <input>).
  const EMAIL_FIELDS = [['objet', emailSubjectInput], ['destinataires', emailToInput], ['cc', emailCcInput], ['cci', emailCciInput]];
  const eachEmailInput = fn => EMAIL_FIELDS.forEach(([key, input]) => { if (input) fn(input, key); });

  function getEmailFieldsFromInputs() {
    // En Lecture, les champs montrent des valeurs résolues, jamais ce qu'il faut enregistrer (Ctrl+S et l'enregistrement automatique ne regardent
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

  // Les cinq champs texte à bulles (nom du fichier PDF, Objet, À, Cc, Cci) : des éditeurs d'une ligne montés dans leurs éléments (js/field-editor.js),
  // après celui du document - la barre d'une bulle réutilise ses réglages.
  function attachFieldEditors(libs) {
    FieldEditor.attach(pdfFilenameInput, libs);
    eachEmailInput(input => FieldEditor.attach(input, libs));
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
    renderTemplateOptions(await (preloaded || Templates.loadAll()));
    adoptTableName();
  }
  function renderTemplateOptions(templates) {
    templateSelect.innerHTML = '';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = I18n.t('template.newOption');
    templateSelect.appendChild(emptyOpt);
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      // Un modèle d'un type que le widget ne sait pas ouvrir (js/templates.js, isOpenableType) reste dans la liste, grisé, sans ★ : la liste d'arbre le montre avec sa raison.
      const unavailable = !Templates.isOpenableType(t.typeModele);
      opt.textContent = t.estParDefaut && !unavailable ? (t.nom + ' ★') : t.nom;
      if (unavailable) { opt.disabled = true; opt.title = Templates.unavailableText(t.typeModele); }
      templateSelect.appendChild(opt);
    });
  }

  // Un modèle d'un type que le widget ne sait pas ouvrir ne se charge jamais : la liste revient sur le modèle ouvert, qui reste à l'écran, et le coin d'état dit pourquoi l'autre ne s'ouvre pas.
  function keepOpenTemplate(tpl) {
    const openId = Templates.getCurrentId();
    templateSelect.value = openId == null ? '' : openId;
    setStatus(I18n.t('status.templateUnavailable', { name: tpl.nom, reason: Templates.unavailableText(tpl.typeModele) }), true);
  }

  // Reflète si le modèle chargé est le modèle par défaut. Rappelée après chaque changement de modèle et après le clic sur le bouton, jamais mise à
  // jour à la main ailleurs : l'icône ne se désynchronise pas de l'état réel.
  function syncDefaultTemplateButton() {
    const btn = document.getElementById('btn-set-default-template');
    if (!btn) return;
    const currentId = Templates.getCurrentId();
    const isDefault = Templates.isDefault(currentId);
    btn.classList.toggle('is-default', isDefault);
    // Un modèle email ou macro ne devient jamais le ★ du document (planning/feature-macro-modeles.md) : l'email est une action ponctuelle sur une ligne
    // et le macro-modèle un mode spécialisé, pas des états où le widget doit démarrer dans toutes les vues. Pour UNE vue, ils le peuvent (Réglages > Vue,
    // js/view-template.js). Le bouton est grisé (même traitement que « aucun modèle chargé »), jamais masqué.
    btn.disabled = currentId == null || !Templates.canBeDocumentDefault(currentTypeModele);
  }

  // Le ★ du document, posé sur le modèle `id` ou retiré s'il le porte déjà. Trois endroits y mènent : le bouton de la barre (le modèle ouvert), une ligne de
  // la liste des modèles et une ligne d'« Organiser mes modèles » (le modèle de la ligne, ouvert ou non). Un seul à la fois (Templates.setDefault) ; un email
  // et un macro-modèle ne le portent jamais. Le cache est à jour quand setDefault rend la main : la liste se redessine sans relire la table. Un clic pendant
  // une écriture est ignoré : le second lot partirait d'un cache qui ne porte pas encore le premier et laisserait deux modèles marqués dans Grist.
  let defaultTemplateWriting = false;
  async function toggleDefaultTemplate(id) {
    const tpl = Templates.byId(id);
    if (!tpl || isReadOnly() || defaultTemplateWriting || !Templates.canBeDocumentDefault(tpl.typeModele)) return;
    defaultTemplateWriting = true;
    try {
      const wasDefault = Templates.isDefault(id);
      await Templates.setDefault(wasDefault ? null : id);
      await refreshTemplateList(Templates.getCached());
      // Le modèle ouvert reste choisi dans la liste ; un modèle pas encore enregistré n'a pas d'identifiant : l'option « Nouveau modèle ».
      const openId = Templates.getCurrentId();
      templateSelect.value = openId == null ? '' : openId;
      syncDefaultTemplateButton();
      setStatus(I18n.t(wasDefault ? 'status.defaultTemplateCleared' : 'status.defaultTemplateSet', { name: tpl.nom }));
    } catch (e) {
      console.error('[main] modèle par défaut non enregistré', e);
      setStatus(I18n.t('status.defaultTemplateError'), true);
    } finally {
      defaultTemplateWriting = false;
    }
  }

  function wireDefaultTemplateButton() {
    const btn = document.getElementById('btn-set-default-template');
    if (!btn) return;
    btn.addEventListener('click', () => toggleDefaultTemplate(Templates.getCurrentId()));
    syncDefaultTemplateButton();
  }

  // Le texte de l'option vide (« — Nouveau modèle — ») : « Renommer » y écrit le nom validé d'un modèle pas encore enregistré, que le titre montre
  // (js/template-tree-select.js:syncTriggerLabel). Chaque modèle chargé, vierge compris, repart de l'invite : le nom d'un modèle abandonné ne s'affiche
  // pas sur le suivant.
  function resetNewOptionText() {
    const blank = templateSelect ? templateSelect.querySelector('option[value=""]') : null;
    const invite = I18n.t('template.newOption');
    if (blank && blank.textContent !== invite) blank.textContent = invite;
  }

  // Le nom du modèle et son nom de fichier PDF. Ce dernier est toujours replié au chargement, même quand un nom est déjà réglé : l'interface de base
  // reste épurée, le crayon (wirePdfFilenameToggle) le déplie à la demande, et la valeur n'est jamais perdue.
  function showTemplateNames(tpl) {
    resetNewOptionText();
    if (templateNameInput) templateNameInput.value = tpl ? tpl.nom : '';
    titleNameBase = tpl && tpl.nom != null ? String(tpl.nom).trim() : null;
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
    EmailPlainText.setActive(false);
    MainToolbar.setMacroMode(true);
    Settings.setMacroMode(true);
    MainToolbar.setGridMode(false);
    syncExportRowsForModelType();
    HeaderFooterPreview.setEmailMode(false);
    syncA4PreviewForModelType();
    Editor.refreshPaginationPreview();
    MainToolbar.syncToolbarState();
    if (btnCreateEmail) btnCreateEmail.hidden = true;
    Templates.setCurrentId(tpl ? tpl.id : null);
    LiveEntry.changed(); // la ligne « Écriture en direct » du menu suit le modèle ouvert (js/live-entry.js)
    Comments.loadForTemplate(tpl ? tpl.id : null, tpl).catch(e => console.error('[main] chargement des commentaires impossible', e));
    MacroEditor.showSummary(tpl);
    syncEditorVisibilityForMode();
    applyPageFitZoomToBoth();
    if (currentMode === 'read') renderReader();
    syncDefaultTemplateButton();
    OrientationToggle.sync(currentTypeModele);
    resetAutosaveState(tpl);
  }

  // Sans l'accès complet au document, Grist refuse au widget la lecture et l'écriture des modèles (js/reader-guide.js : editorLacksAccess) : en Édition,
  // la carte « Donnez l'accès complet à ce widget » prend la place du document et du résumé d'un macro-modèle. La Lecture a la sienne
  // (ReaderGuide.render, js/reader-mode.js).
  function isAccessGuideShown() { return currentMode === 'edit' && ReaderGuide.editorLacksAccess(); }

  // Construite à l'affichage et vidée au départ : une carte cachée garderait pour rien son identifiant de titre (celui de la Lecture est un autre) et
  // ses images.
  function syncAccessGuide(shown) {
    if (!accessGuideContainer) return;
    if (shown && !accessGuideContainer.firstElementChild) ReaderGuide.renderAccess(accessGuideContainer);
    if (!shown) accessGuideContainer.replaceChildren();
    accessGuideContainer.style.display = shown ? 'block' : 'none';
  }

  // Une remise en ordre de la mise en page (colonnes gelées, tableau ramené dans la page) n'est pas une modification de la personne : l'état « à
  // enregistrer » reste celui d'avant, sinon un simple retour au Mode édition ou un Aperçu A4 rallumé réécrirait le modèle à la passe
  // d'enregistrement suivante (loadTemplateIntoEditor remet cet état à zéro en dernier, pour la même raison).
  function withoutMarkingDirty(action) {
    const wasDirty = autosaveDirty;
    action();
    if (!wasDirty && autosaveDirty) { autosaveDirty = false; autosaveSettingsDirty = false; updateSaveStatus(); }
  }

  // Affiche l'éditeur, le résumé du macro-modèle, la carte de l'accès ou la Lecture selon le mode, l'accès du widget et le type du modèle chargé.
  // Partagé par switchMode et les deux chargeurs : un changement de modèle en pleine édition ne repasse pas par switchMode.
  function syncEditorVisibilityForMode() {
    const accessGuide = isAccessGuideShown();
    const showEditor = currentMode === 'edit' && currentTypeModele !== 'macro' && !accessGuide;
    const showMacroSummary = currentMode === 'edit' && currentTypeModele === 'macro' && !accessGuide;
    editorContainer.style.display = showEditor ? 'block' : 'none';
    // La bande de la barre de la case d'une grille (css/grid.css) disparaît avec l'éditeur : Lecture, résumé d'un macro-modèle, carte de l'accès.
    document.body.classList.toggle('pp-editor-hidden', !showEditor);
    if (macroSummaryContainer) macroSummaryContainer.style.display = showMacroSummary ? 'block' : 'none';
    syncAccessGuide(accessGuide);
    // Les barres flottantes d'une bulle, d'un tableau ou d'une image sont ancrées dans l'éditeur : masqué, elles n'ont plus rien à montrer. Sans
    // cela, la barre d'une bulle restée sélectionnée sautait en haut à gauche, par-dessus les boutons Lecture et Édition, et le blur de l'éditeur la
    // réaffichait aussitôt après un clic sur « Lecture ».
    // Le panneau Rechercher / Remplacer (js/find-replace.js) cherche dans l'éditeur : masqué, il se ferme sans lui rendre le clavier.
    if (!showEditor) { EditorCore.hideFloatingContextToolbars(); FindReplace.close({ focus: false }); }
    // Un modèle chargé pendant que l'éditeur était masqué n'a pas pu être mesuré : ses colonnes sont ajustées maintenant qu'il a une mise en page,
    // sinon un tableau trop large pour la page ne rentrerait qu'à la prochaine frappe.
    if (showEditor) {
      withoutMarkingDirty(Editor.refreshLayout);
      // Orientation changée pendant que l'éditeur était masqué : la grille page des images en calque est recapturée maintenant qu'il a une mise en
      // page.
      recaptureStaleLayerGrids();
    }
    // La bande des diapositives suit l'éditeur : montrée à gauche d'une présentation en Édition, cachée sinon (js/slides-entry.js).
    SlidesEntry.changed();
  }

  // forcedTypeModele : seulement pour tpl = null (nouveau modèle vide, cf. startNewTemplate) ; un modèle existant porte son propre type, jamais
  // réécrit ici.
  function loadTemplateIntoEditor(tpl, forcedTypeModele) {
    // Le point de passage de toute ouverture (liste, modèle de la vue, règle de ligne, retours, restauration...) : un modèle d'un type que le widget ne sait pas ouvrir n'entre jamais
    // dans l'éditeur, quel que soit le chemin (garde « type inconnu », js/templates.js:isOpenableType). Avant tout le reste : rien de l'écran ne change.
    if (tpl && !Templates.isOpenableType(tpl.typeModele)) { keepOpenTemplate(tpl); return; }
    // L'écriture en direct est celle du texte d'UN modèle : elle s'arrête avant que l'éditeur change de texte, quel que soit le chemin d'ouverture (js/live-entry.js).
    LiveEntry.releaseEditor();
    forgetMacroOriginUnless(tpl);
    forgetLinkedOriginUnless(tpl);
    // Le niveau de zoom gardé pour ce modèle (macro-modèle compris), avant tout calcul du facteur d'ajustement de la page (js/page-zoom.js).
    PageZoom.useTemplate(tpl);
    // Les réglages d'export gardés pour ce modèle (type d'export, qualité du PDF, lignes exportées) : les menus se redessinent plus bas, avec son type
    // (syncExportRowsForModelType).
    ExportChoices.useTemplate(tpl);
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
    EmailPlainText.setActive(currentTypeModele === 'email');
    MainToolbar.setMacroMode(false);
    Settings.setMacroMode(false);
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
    // Après la remise à zéro : ce que la synchro dit sur la ligne d'état n'est pas effacé par elle, et son tableau remplacé ne rend pas le document « à enregistrer ».
    followLinkedModels(true);
  }

  // Les tableaux liés du document ouvert suivent leur modèle (js/linked-table.js:syncOpen), d'après les modèles du cache : à l'ouverture (`loading` : les désaccords déjà dits se redisent) et
  // à chaque lecture de l'enregistrement automatique. En Lecture, la feuille se redessine quand un tableau a changé.
  function followLinkedModels(loading) {
    const editor = EditorCore.getEditor();
    const synced = loading ? LinkedTable.syncOnLoad(editor) : LinkedTable.syncOpen(editor);
    // Les diapositives liées d'une présentation suivent leur source de même (js/slide-links.js:follow).
    const slides = SlideLinks.follow(editor, loading);
    if (((synced && synced.pulled.length) || (slides && slides.pulled.length)) && currentMode === 'read') renderReader();
    return synced;
  }

  function typeModeleOf(tpl, forcedTypeModele) {
    // Le genre propre au modèle, « document » à défaut ; forcedTypeModele ne sert qu'à un nouveau modèle vide (tpl = null).
    return tpl ? (tpl.typeModele || 'document') : (forcedTypeModele || 'document');
  }

  // Le contenu du modèle dans l'éditeur : marges, grille des images, texte avec son suivi des modifications, en-tête et pied.
  function loadContentIntoEditor(tpl, typeModele) {
    // Marges posées avant setHTML : les zones à deux colonnes en mm calculent --layout-left dès leur première construction, à partir de
    // PageLayout.getContentWidthMm() ; posées après, une première passe se ferait avec les marges du modèle précédent. Une présentation vierge, ou sans format à elle, prend la page
    // d'une diapositive (js/slides-entry.js).
    PageLayout.setMarginsMm(SlidesEntry.pageFor(typeModele, tpl ? tpl.marginsMm : null));
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
    LiveEntry.changed(); // la ligne « Écriture en direct » du menu suit le modèle ouvert (js/live-entry.js)
    Comments.loadForTemplate(tpl ? tpl.id : null, tpl).catch(e => console.error('[main] chargement des commentaires impossible', e));
  }

  let nameBeforeEdit = null; // le nom du modèle quand le crayon a ouvert le champ ; null hors saisie
  // Le nom que le titre tient de la table pour le modèle ouvert : celui qu'il y a lu à l'ouverture, ou que ce widget y a écrit depuis (saveScreenAs) ; null pour un modèle pas encore enregistré. La personne a changé
  // le nom ici quand le champ n'est plus celui-là. GFS renomme un fichier en n'écrivant que la colonne Nom de sa ligne (consigne GFS 029) : le nom d'un titre ouvert avant ne doit jamais repartir dans un lot.
  let titleNameBase = null;
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
    const previous = id == null ? null : (nameBeforeEdit != null ? nameBeforeEdit : (titleNameBase !== null ? titleNameBase : (stored ? stored.nom : null)));
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

  // Le titre prend le nom que la table porte pour le modèle ouvert quand la personne n'a pas changé le sien et qu'un autre l'a renommé depuis (l'explorateur de GFS, consigne 029). Appelée quand le cache des modèles vient
  // d'être relu : à chaque passage de l'enregistrement automatique qui lit la table, et à chaque rafraîchissement de la liste. Jamais pendant la saisie du crayon, ni sur un nom que la personne a tapé : c'est le sien
  // qui part alors à l'enregistrement.
  function adoptTableName() {
    if (!templateNameInput || !templateSelect || titleNameBase === null || nameBeforeEdit !== null) return;
    const id = Templates.getCurrentId();
    const stored = id == null ? null : Templates.byId(id);
    const name = stored && stored.nom != null ? String(stored.nom).trim() : '';
    if (!name || name === titleNameBase || templateNameInput.value.trim() !== titleNameBase) return;
    templateNameInput.value = name;
    titleNameBase = name;
    const option = templateSelect.options[templateSelect.selectedIndex];
    if (option && option.value !== '' && String(option.value) === String(id)) option.textContent = Templates.isDefault(id) ? name + ' ★' : name;
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
    // Le nom d'avant l'ouverture du crayon revient dans le champ. Un passage de l'enregistrement automatique a pu écrire en route un nom tapé à moitié
    // (cf. settleTemplateName) : le suivant réécrit celui-ci.
    function restoreNameBeforeEdit() {
      templateNameInput.value = nameBeforeEdit;
      markAutosaveDirty();
    }
    function commitAndClose() {
      if (nameBeforeEdit !== null) { // seulement une saisie ouverte par le crayon, pas un blur parasite
        if (!templateNameInput.value.trim() && nameBeforeEdit) {
          // Un nom effacé n'est pas un nom : le titre garderait l'ancien au-dessus d'un champ vide, et ni l'enregistrement automatique ni Enregistrer
          // n'écrivent un modèle sans nom - plus rien ne serait gardé, sans un mot. Le champ reprend le nom d'avant et le coin d'état le dit, comme
          // pour un nom déjà pris : seulement quand l'enregistrement automatique est actif (coupé, « Modifications non enregistrées. » protège ce
          // qui n'est écrit nulle part). Un modèle neuf jamais nommé n'a rien à reprendre.
          restoreNameBeforeEdit();
          if (isAutosaveEnabled()) setStatus(I18n.t('status.nameKept', { name: nameBeforeEdit }));
        } else settleTemplateName();
      }
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
    templateNameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') templateNameInput.blur();
      // Échap abandonne la frappe : le nom d'avant revient et le champ se referme. Pas pendant une composition de texte (accent mort, saisie asiatique) :
      // Échap n'y annule que la composition.
      else if (e.key === 'Escape' && !e.isComposing && nameBeforeEdit !== null) {
        e.preventDefault();
        if (templateNameInput.value.trim() !== nameBeforeEdit) restoreNameBeforeEdit();
        templateNameInput.blur();
      }
    });
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
    leavePromptCount++; // plusieurs demandes peuvent se chevaucher (un deuxième clic pendant l'attente ci-dessous) : le drapeau ne retombe qu'avec la dernière
    leavePromptOpen = true; // plus aucun passage de l'enregistrement automatique ne part
    let choice;
    try {
      // Un passage déjà parti finit d'écrire pendant la question, que le drapeau ci-dessus n'arrête pas (il n'est regardé qu'au départ d'un passage) : « Abandonner » ne laisserait rien à
      // abandonner. Il est donc attendu d'abord ; s'il a tout enregistré, il n'y a plus rien à demander.
      if (autosaveTickPending) {
        await whenAutosaveTickDone(LEAVE_PROMPT_TICK_WAIT_MS);
        if (!hasEditsToConfirmBeforeLeaving()) return true;
      }
      choice = await Dialogs.choose({
        title: I18n.t('dialog.unsaved.title'),
        message: name ? I18n.t('dialog.unsaved.message', { name }) : I18n.t('dialog.unsaved.messageNoName'),
        choices,
      });
    } finally { if (--leavePromptCount === 0) leavePromptOpen = false; }
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
    // Avant la question « Enregistrer / Abandonner / Annuler » : un modèle qui ne s'ouvrira pas ne doit pas faire quitter celui qui est à l'écran.
    const chosen = id ? Templates.byId(id) : null;
    if (chosen && !Templates.isOpenableType(chosen.typeModele)) { keepOpenTemplate(chosen); return; }
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
    if (!Templates.openableById(id) || Templates.isCurrent(id)) return false;
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

  // true : le modèle vierge est à l'écran ; false : rien n'a changé (lecture seule, ou « Annuler » à la question d'enregistrement). Les boutons ne lisent pas la valeur, GFS oui (openBlankOfType).
  async function startNewTemplate(typeModele) {
    if (isReadOnly()) return false;
    if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return false;
    startBlankDocument(typeModele);
    return true;
  }
  const onNew = () => startNewTemplate();
  const onNewEmail = () => startNewTemplate('email');
  const onNewGrid = () => startNewTemplate(GridEditor.TYPE);
  // « Nouvelle présentation » : sans l'extension « diapositives » de GFS, la ligne est grisée et son clic explique (js/slides-entry.js).
  const onNewPresentation = () => SlidesEntry.startNew();

  // « Nouveau » demandé par GFS (js/gfs-open.js, consigne GFS 014) : un modèle vierge du type demandé, par le chemin du bouton « Nouveau » du même type - donc avec sa question « Enregistrer / Abandonner / Annuler »
  // quand des modifications attendent. true : il est à l'écran à la fin (macro-modèle : son écran de composition, vide, est ouvert) ; false : la personne a annulé, le document est en lecture seule, ou ce type ne
  // s'ouvre pas ici.
  async function openBlankOfType(type) {
    switch (type) {
      case 'document': return onNew();
      case 'email': return onNewEmail();
      case GridEditor.TYPE: return onNewGrid();
      case 'macro': return onNewMacro();
      case SlidesEntry.TYPE: return onNewPresentation();
      default: return false;
    }
  }

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

  // Import d'un fichier Markdown (js/markdown-import.js), « Importer un Markdown… » du menu « + », sur le modèle de l'import d'un classeur : le sélecteur s'ouvre dans
  // le clic, le fichier est lu et converti ensuite, et ce n'est qu'après (un fichier refusé ne coûte rien) qu'on demande de quitter le modèle courant s'il a des
  // modifications non enregistrées. Le résultat est un nouveau document, sans nom et pas encore enregistré, comme « Nouveau document » ; l'en-tête et le pied de page
  // que le fichier porte (ceux que l'export Markdown écrit) deviennent ceux du document.
  const MD_IMPORT_ACCEPT = '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain';
  const MD_IMPORT_ERRORS = { unreadable: 'status.mdImportUnreadable', empty: 'status.mdImportEmpty', tooBig: 'status.mdImportTooBig', library: 'status.mdImportLibrary' };
  function onImportMd() {
    if (isReadOnly()) return;
    GridXlsxImport.chooseFile(async (file) => {
      setStatus(I18n.t('status.mdImporting'));
      const imported = await readMdForImport(file);
      if (!imported) return;
      if (hasEditsToConfirmBeforeLeaving()) {
        updateSaveStatus(); // la lecture est finie : « Lecture… » serait faux pendant la question
        if (!(await askBeforeLeaving())) return;
      }
      openImportedDocument(imported);
    }, MD_IMPORT_ACCEPT);
  }

  // Lit le fichier et construit le document. null : le fichier est refusé (l'erreur est dite dans le coin d'état) ; rien d'autre ne se passe.
  async function readMdForImport(file) {
    try {
      return await MarkdownImport.fromFile(file);
    } catch (e) {
      reportMdImportError(e);
      return null;
    }
  }

  function reportMdImportError(e) {
    console.warn('[main] import Markdown impossible', e); // une erreur de la personne (mauvais fichier) ou du réseau, pas du widget
    const megabytes = bytes => (Math.ceil(bytes / 104857.6) / 10).toLocaleString(I18n.getLang()); // vers le haut : « 10,1 Mo (au plus 10 Mo) », jamais « 10 Mo (au plus 10 Mo) »
    const key = MD_IMPORT_ERRORS[e && e.code] || MD_IMPORT_ERRORS.unreadable;
    setStatus(I18n.t(key, { size: e && e.size ? megabytes(e.size) : '', max: e && e.max ? megabytes(e.max) : '' }), true);
  }

  function openImportedDocument(imported) {
    // Un nouveau document, sans nom et pas encore enregistré, comme « Nouveau document ».
    templateSelect.value = '';
    loadTemplateIntoEditor({ id: null, nom: '', contenu: imported.html, typeModele: 'document', marginsMm: null, suiviModifications: null, headerFooter: imported.headerFooter }, 'document');
    markAutosaveDirty();
    setStatus(mdImportedStatus(imported));
  }

  // Ce que le coin d'état dit d'un Markdown importé : les images locales qui n'ont pas été reprises et les {{Table.Colonne}} qui ne sont pas des variables de ce document
  // (laissées en texte), en une phrase quand il y a les deux (le coin d'état coupe ce qui dépasse, à droite).
  function mdImportedStatus(imported) {
    const images = imported.skippedImages || 0;
    const variables = imported.unknownVariables || 0;
    if (images && variables) return I18n.t('status.mdImportedImagesVariables', { images, variables });
    if (variables) return I18n.t('status.mdImportedVariables', { n: variables });
    return images ? I18n.t('status.mdImportedImages', { n: images }) : I18n.t('status.mdImported');
  }

  // Un nouveau macro-modèle n'a rien à charger avant d'avoir été composé et enregistré : contrairement aux autres types, il ne vide pas l'éditeur, il
  // ouvre l'écran de composition, vide. true : cet écran est ouvert (GFS le demande, openBlankOfType) ; false : le document est en lecture seule.
  function onNewMacro() {
    if (isReadOnly()) return false;
    MacroEditor.openModal(null);
    return true;
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
    if (!tpl || tpl.typeModele === 'macro' || !Templates.isOpenableType(tpl.typeModele)) { templateSelect.value = macroId; return; }
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
  }

  // Ouvrir le modèle d'un tableau lié, et revenir au document
  // « Ouvrir le modèle » du menu du lien d'un tableau lié (js/linked-table.js:open) ouvre ce modèle Grille dans l'éditeur comme un choix de la liste ; tant qu'il est à l'écran, le bandeau
  // « Revenir au document » (#linked-return-bar) ramène au document d'origine, le curseur dans la même case du tableau. linkedOrigin est remis à null dès qu'un autre modèle se charge
  // (liste, « + », galerie, suppression, copie : forgetLinkedOriginUnless), jamais quand le même est rechargé (conflit d'enregistrement automatique).

  function syncLinkedReturnBar() {
    if (!linkedReturnBar) return;
    const origin = linkedOrigin && Templates.byId(linkedOrigin.templateId);
    linkedReturnBar.hidden = !origin;
    const text = document.getElementById('linked-return-text');
    if (!text) return;
    text.textContent = origin ? I18n.t('linkedTable.return.text', { name: origin.nom }) : '';
    text.title = text.textContent; // le nom d'un document long est coupé par « … » : la phrase se lit en entier au survol
  }

  function forgetLinkedOriginUnless(tpl) {
    if (!linkedOrigin || (tpl && Templates.isCurrent(tpl.id))) return;
    linkedOrigin = null;
    syncLinkedReturnBar();
  }

  // Le même chemin qu'un choix du modèle dans la liste : la question « Modifications non enregistrées » est posée au document qui en a (« Annuler » le garde à l'écran, tel quel). La
  // liste et le cache des modèles sont relus d'abord, comme pour un modèle d'un macro-modèle : un modèle créé ailleurs depuis le dernier passage n'a pas encore sa ligne dans le <select>.
  // Un document jamais enregistré, abandonné à la question, n'a plus où revenir : pas de bandeau.
  async function openLinkedModel({ id, name, place }) {
    if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return;
    const templateId = Templates.getCurrentId();
    const macro = macroOrigin;
    const epoch = autosaveEpoch;
    try { await refreshTemplateList(); } catch (e) { console.warn('[main] relecture des modèles impossible', e); }
    // Un autre modèle s'est chargé pendant la relecture (un choix dans la liste) : celui-là gagne.
    if (epoch !== autosaveEpoch) return;
    const model = Templates.byId(id);
    if (!model || model.typeModele !== GridEditor.TYPE) { setStatus(I18n.t('linkedTable.gone', { name }), true); return; }
    templateSelect.value = model.id;
    loadTemplateIntoEditor(model);
    linkedOrigin = templateId == null ? null : { templateId, modelId: model.id, place, macroOrigin: macro };
    syncLinkedReturnBar();
  }

  // Même chemin que la liste aussi pour le retour : la question « Modifications non enregistrées » est posée si le modèle en a (« Annuler » le garde, et le bandeau aussi). Le cache des
  // modèles est relu d'abord : ce que le modèle vient de recevoir est ce que le document lit. Le document revient avec son bandeau de macro-modèle s'il en avait un, le curseur dans la
  // case du tableau qu'on avait quittée. Le document suit son modèle à son ouverture (followLinkedModels) : un tableau qui diffère encore du modèle - modifié ici, ou des deux côtés - le dit sur la ligne d'état.
  async function returnFromLinkedModel() {
    const origin = linkedOrigin;
    if (!origin) return;
    try { await Templates.loadAll(); } catch (e) { console.error('[main] relecture des modèles impossible', e); }
    // Document supprimé depuis (par quelqu'un d'autre) : le modèle reste à l'écran, le bandeau s'efface.
    if (!Templates.byId(origin.templateId)) { syncLinkedReturnBar(); return; }
    templateSelect.value = origin.templateId;
    await onTemplateSelectChange();
    if (!Templates.isCurrent(origin.templateId)) return;
    if (origin.macroOrigin && Templates.byId(origin.macroOrigin.macroId)) { macroOrigin = origin.macroOrigin; syncMacroReturnBar(); }
    if (currentMode !== 'edit') return;
    const shown = LinkedTable.reveal(EditorCore.getEditor(), origin.modelId, origin.place);
    if (shown && shown.differs) setStatus(I18n.t('linkedTable.differs', { name: shown.name }));
  }

  function wireLinkedReturn() {
    const button = document.getElementById('btn-linked-return');
    if (button) button.addEventListener('click', returnFromLinkedModel);
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
  // email. `alsoWrite` : les modèles Grille que les tableaux liés du document ont changé, écrits dans le même lot (js/linked-table.js:prepareSend).
  // Le nom ne part que pour un modèle neuf et quand la personne l'a changé ici (le crayon, « Enregistrer sous… », la galerie) : celui du titre, tel qu'il a été lu dans la table à l'ouverture, ne repart pas, et la table garde
  // le nom que GFS ou une autre personne lui a donné depuis (consigne GFS 029). Ce qui part devient le nom que le titre tient de la table.
  function saveScreenAs(id, nom, suiviModifications, html = Editor.getHTML(), alsoWrite = null) {
    const written = id != null && titleNameBase !== null && nom === titleNameBase ? null : nom;
    const epoch = autosaveEpoch;
    return Templates.save(id, written, html, getPdfFilenameTemplate(), Editor.getHeaderFooterData(), PageLayout.getMarginsMm(), currentTypeModele, getEmailFieldsFromInputs(), suiviModifications, alsoWrite).then(saved => {
      if (written !== null && epoch === autosaveEpoch) titleNameBase = written; // un autre modèle ouvert pendant l'écriture a pris le sien (showTemplateNames)
      return saved;
    });
  }

  // Les tableaux liés que le document a changé et pas leur modèle partent avec son enregistrement (js/linked-table.js:prepareSend, lot 6c-2b) : null quand rien ne part (un macro-modèle n'a rien
  // dans l'éditeur), sinon le HTML à écrire avec la base d'après et ce qui s'écrit dans les modèles. À prendre dans le même bloc synchrone que la lecture du document, après le dernier `await`.
  // Les diapositives liées d'une présentation que seule elle a changées partent de même vers leur source (js/slide-links.js:prepareSend), dans le même lot.
  function linkedSendFor(isMacro) {
    if (isMacro) return null;
    const editor = EditorCore.getEditor();
    const tables = LinkedTable.prepareSend(editor);
    const slides = SlideLinks.prepareSend(editor, tables ? tables.doc : null);
    if (!tables || !slides) return tables || slides;
    return {
      html: slides.html,
      writes: tables.writes.concat(slides.writes),
      commit() { tables.commit(); slides.commit(); },
      announce() { tables.announce(); slides.announce(); },
    };
  }
  // Ce que ce widget vient de lire ou d'écrire du modèle `id` (le cache, à jour après une écriture) : une présentation ouverte ailleurs dont seules des diapositives à repère changent prend
  // l'envoi sans bandeau de conflit (js/slide-links.js:adopt).
  function noteKnownState(id) { SlideLinks.noteKnown(id == null ? null : Templates.byId(id)); }

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
    let savedId, dateModif, send = null, synced = null;
    const epoch = autosaveEpoch;
    try {
      const suiviModifications = await Editor.getSuiviModificationsForSave();
      // Cette attente (l'identification de la personne : une écriture et une lecture de Grist quand elle n'est pas encore connue, des secondes quand
      // Grist est lent) a pu laisser choisir un autre modèle : l'éditeur montre alors celui-là, et l'écrire sous l'identifiant de ce modèle-ci le
      // remplacerait. Le choisir en répondant « Abandonner » renonce à cet enregistrement.
      if (epoch !== autosaveEpoch) return;
      // Un tableau lié est à envoyer à son modèle : les modèles sont relus d'abord (un passage de l'enregistrement automatique vient de le faire, pas un Enregistrer à la main, surtout quand le passage est coupé),
      // sans quoi un modèle changé ailleurs depuis serait écrasé sans que personne ne le voie. Une relecture qui échoue renonce à l'envoi, pas à l'enregistrement du document.
      let modelsFresh = true;
      if (LinkedTable.hasPending(EditorCore.getEditor()) || SlideLinks.hasPending(EditorCore.getEditor())) {
        modelsFresh = await LinkedTable.refreshModels();
        if (epoch !== autosaveEpoch) return;
        // Les modèles sont frais : les tableaux suivent les leurs comme à un passage de l'enregistrement automatique (un modèle changé ailleurs en même temps que le tableau : l'écart se dit, rien ne part).
        if (modelsFresh) synced = followLinkedModels();
      }
      const editVersion = autosaveEditVersion;
      send = modelsFresh ? linkedSendFor(false) : null;
      const token = LiveEntry.saveToken(); // l'état du texte juste avant qu'il soit lu (écriture en direct)
      ({ id: savedId, dateModif } = await saveScreenAs(id, nom, suiviModifications, send ? send.html : undefined, send ? send.writes : null));
      LiveEntry.published(token, dateModif);
      // La date écrite est notée tout de suite, avant la relecture de la liste plus bas (une lecture de Grist de plus, des secondes quand il est
      // lent) : un passage de l'enregistrement automatique entre les deux verrait cette date sans la connaître et conclurait « modifié ailleurs »
      // (cf. autosaveTick). Un modèle chargé pendant l'écriture (autosaveEpoch) garde son propre état. Un enregistrement manuel tranche tout conflit
      // en cours en faveur de cette version : pas besoin de recharger.
      if (epoch === autosaveEpoch) {
        autosaveLastKnownDateModif = dateModif;
        noteSaved(editVersion);
        hideConflictBanner();
        if (send) send.commit(); // Grist a écrit le document et les modèles ensemble : les tableaux partis prennent leur base
        noteKnownState(savedId);
      }
    } catch (e) {
      // La personne a refusé de créer les tables du widget : rien n'est enregistré, et le coin d'état le dit (ni échec ni journal d'erreur : elle a
      // répondu elle-même, et Enregistrer lui reposera la question).
      if (GristAPI.isTablesDeclined(e)) { setStatus(I18n.t('status.saveDeclined'), true); return; }
      // Un échec ici (par exemple une colonne Grist manquante) doit se voir : sans ce traitement, la fonction s'interromprait sans message, la liste
      // et le coin d'état ne seraient pas mis à jour, et rien ne dirait que « Enregistrer » n'a rien enregistré.
      console.error('[main] échec de l’enregistrement manuel', e);
      setStatus(I18n.t('status.saveError'), true);
      return;
    }
    if (epoch === autosaveEpoch) { Templates.setCurrentId(savedId); ExportChoices.adopt(savedId); LiveEntry.changed(); } // un modèle neuf enregistré peut s'écrire en direct
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
      forgetLinkedOriginUnless(null); // ni le modèle que le tableau du document désigne : le retour n'a plus de sens non plus
    }
    updateSaveStatus();
    if (sameTemplate) LinkedTable.tell(synced, send);
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
    // Une copie est un autre modèle : l'écriture en direct, qui est celle du texte de celui-ci, s'arrête d'abord (js/live-entry.js).
    await LiveEntry.stop();
    // Un enregistrement encore en cours (Grist lent) rendrait, à sa fin, son identifiant au modèle courant (cf. runSave) : la copie, qui part d'un
    // modèle sans identifiant, attend qu'il soit fini, celui d'un deuxième clic compris.
    const epoch = autosaveEpoch;
    while (saveIsRunning() || saveWaiting) await (saveWaiting || whenSaveFinished());
    if (epoch !== autosaveEpoch) return; // un autre modèle a été choisi pendant l'attente : la copie n'a plus d'objet
    if (templateNameInput) templateNameInput.value = nom;
    Templates.setCurrentId(null);
    ExportChoices.detach();
    await onSave();
  }

  // Historique des versions (js/versions-store.js garde les versions à chaque enregistrement ; la fenêtre, js/versions-history.js, ne se charge qu'ici, au premier clic). Le modèle ouvert
  // doit déjà être enregistré : un modèle neuf n'a pas de version.
  async function openVersionHistory() {
    if (isReadOnly()) return;
    const id = Templates.getCurrentId();
    const tpl = Templates.byId(id);
    if (!id || !tpl) { setStatus(I18n.t('status.versionsNeedSavedTemplate'), true); return; }
    try {
      await VersionsStore.loadWindow();
      VersionsHistory.open({ id, name: tpl.nom, restore: (snapshot, when) => restoreVersionOnScreen(id, snapshot, when), nameVersion: (target, label) => nameVersionOnScreen(id, target, label) });
    } catch (e) {
      console.error('[main] fenêtre de l’historique des versions impossible', e);
      setStatus(I18n.t('status.versionsUnavailable'), true);
    }
  }

  // Une erreur que la fenêtre de l'historique dit sous son titre (la clé du texte).
  function versionError(key) { return Object.assign(new Error(I18n.t(key)), { versionsKey: key }); }

  // Attend la fin du passage de l'enregistrement automatique en cours (aucun autre ne part tant que restoringVersion ou leavePromptOpen est vrai) : il écrirait sinon l'ancien écran après la
  // restauration, ou le texte que la question de départ demande d'abandonner. `limitMs` : la question de départ n'attend pas plus que cela un Grist qui ne répond pas.
  async function whenAutosaveTickDone(limitMs = AUTOSAVE_TICK_WATCHDOG_MS) {
    const giveUpAt = Date.now() + limitMs;
    while (autosaveTickPending && Date.now() - autosaveTickStartedAt < AUTOSAVE_TICK_WATCHDOG_MS && Date.now() < giveUpAt) await new Promise(resolve => setTimeout(resolve, 40));
  }

  // Donne (ou retire, avec '') un nom à une version de l'historique ; refusé en lecture seule, comme une restauration. `target` : { rowId } (une version gardée) ou { state, at, author } (l'état enregistré que
  // « Version actuelle » montre : il est gardé sous ce nom, et la ligne ajoutée est rendue : { rowId }).
  async function nameVersionOnScreen(id, target, label) {
    if (isReadOnly()) throw versionError('versions.nameError');
    try {
      if (target.rowId != null) { await VersionsStore.renameVersion(target.rowId, label); return {}; }
      return await VersionsStore.keepNamed({ modelRowId: id, state: target.state, at: target.at, author: target.author, name: label, tokenFor: () => Templates.ensureToken(id) });
    } catch (e) {
      if (e && e.versionsKey) throw e;
      throw versionError('versions.nameError');
    }
  }

  // Remet dans le modèle ouvert l'état d'une de ses versions. Ce que l'écran montre et n'est pas encore enregistré part d'abord, comme un Enregistrer (il devient l'état que la restauration
  // remplace) ; l'état remplacé est gardé dans une version (Templates.restoreVersion), puis l'éditeur repart de l'état restauré, comme après « Recharger » du bandeau de conflit.
  async function restoreVersionOnScreen(id, snapshot, when) {
    if (isReadOnly()) throw versionError('versions.restoreError');
    // Une version remplacerait le texte que les autres personnes écrivent en ce moment : l'écriture en direct s'arrête d'abord, de la main de la personne.
    if (LiveEntry.isLive()) throw versionError('versions.restoreLive');
    restoringVersion = true;
    try {
      await whenAutosaveTickDone();
      while (saveIsRunning() || saveWaiting) await (saveWaiting || whenSaveFinished());
      if (String(Templates.getCurrentId()) !== String(id)) throw versionError('versions.restoreError');
      // Un macro-modèle n'a rien dans l'éditeur : son Enregistrer rouvre sa fenêtre.
      if (autosaveDirty && currentTypeModele !== 'macro') {
        await onSave();
        if (autosaveDirty) throw versionError('versions.restoreNeedsSave');
      }
      await Templates.whenIdle();
      await Templates.restoreVersion(id, snapshot);
      await refreshTemplateList();
      const restored = Templates.byId(id);
      if (restored) {
        loadTemplateIntoEditor(restored);
        templateSelect.value = id;
        syncDefaultTemplateButton();
      }
      setStatus(I18n.t('status.versionRestored', { when }));
    } catch (e) {
      if (e && e.versionsKey) throw e;
      throw versionError('versions.restoreError');
    } finally {
      restoringVersion = false;
    }
  }

  async function onDelete() {
    if (isReadOnly()) return;
    const id = Templates.getCurrentId();
    if (!id) { setStatus(I18n.t('status.noTemplateSelected'), true); return; }
    // Un modèle Grille posé comme tableau lié dans d'autres modèles : la question le dit, ces tableaux gardent leurs cases et perdent leur lien (js/linked-table.js:usedBy).
    const used = LinkedTable.usedBy(id).length;
    const message = used ? I18n.t('linkedTable.deleteUsed', { n: used }) : '';
    if (!(await Dialogs.confirm({ title: I18n.t('confirm.deleteTemplate'), message, confirmLabel: I18n.t('common.delete'), danger: true }))) return;
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
  // Le droit d'export couvre PDF (une ligne, ZIP, PDF unique), Word, Excel et la création d'email : #v2-quality-group (le type d'export) et
  // #v2-export-pdf-group (le bouton Exporter et ses lignes, Word et Excel compris) sont grisés ensemble.
  const EXPORT_LOCKED_IDS = ['v2-quality-group', 'v2-export-pdf-group', 'btn-create-email'];
  // Les quatre champs des marges, et avec eux les quatre préréglages et la chaîne qui lie les marges (js/settings.js) : tout ce qui change une marge est grisé.
  const READ_ONLY_DISABLED_INPUTS = ['settings-margin-top', 'settings-margin-right', 'settings-margin-bottom', 'settings-margin-left',
    'settings-margin-preset-none', 'settings-margin-preset-narrow', 'settings-margin-preset-classic', 'settings-margin-preset-wide', 'settings-margins-link'];
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

  // Barre de mise en forme et d'insertion (#v2-toolbar) : grisée en lecture seule, dès que la Lecture est affichée, choisie ou imposée, et tant que la
  // carte de l'accès remplace l'éditeur. L'éditeur y est masqué mais ses commandes restent actives : un clic sur Tableau, Sommaire ou Citation
  // modifierait le modèle caché, que l'enregistrement automatique écrirait sans rien montrer. Commenter suit son propre droit, jamais le mode : dans la
  // Lecture il agit sur le texte sélectionné dans la Lecture (applyCommentsPermissions). Modes, aperçu A4, réglages, arbre des modèles et exports ne
  // font pas partie de #v2-toolbar et restent actifs. Rappelée par applyAccessRights (droits), switchMode (mode) et onWidgetAccessChange (accès).
  function applyFormattingBarLock() {
    const formattingBar = document.getElementById('v2-toolbar');
    if (!formattingBar) return;
    const locked = isReadOnly() || currentMode === 'read' || isAccessGuideShown();
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
    LiveEntry.changed(); // un document en lecture seule ne s'écrit pas en direct : la ligne du menu suit les droits (js/live-entry.js)
    SlidesEntry.changed(); // ni ses diapositives (js/slides-entry.js)
  }

  // Grist rend les options du widget quand son accès change (GristAPI.onAccessLevelChange) : la carte de l'accès arrive ou s'en va tout de suite, et la
  // barre de mise en forme se grise ou se dégrise avec elle. Grist reconstruit en fait le cadre du widget à chaque changement d'accès (WidgetFrame.ts) :
  // la page repart alors de zéro, ce rappel couvre seulement la réponse qui arrive après le premier affichage.
  function onWidgetAccessChange() {
    syncEditorVisibilityForMode();
    applyFormattingBarLock();
  }

  // Droits changés en cours de session (case cochée dans la table, réglage modifié) : switchMode force lui-même le mode Lecture en lecture seule ;
  // sinon un mode Lecture déjà affiché est redessiné, commentaires montrés ou non.
  function onAccessRightsChange() {
    applyAccessRights();
    if (isReadOnly() || currentMode === 'read') switchMode(currentMode);
    openCleanReadingForReadOnly();
    openNewsForEditors();
  }

  // Case « Ouvrir les personnes en lecture seule sur la Lecture épurée » (Réglages > Accès) : voir CleanReading.openForReadOnly, qui décide une seule
  // fois par session. Appelée à la fin d'init() puis à chaque changement de droits : tant que la table des droits n'a pas donné de réponse (pending,
  // Grist lent ; error, table illisible), rien n'est décidé - une personne qui a tous les droits démarre verrouillée par précaution et ne doit jamais
  // être mise en Lecture épurée sur cette foi.
  function openCleanReadingForReadOnly() {
    const config = AccessRights.getConfig();
    CleanReading.openForReadOnly({ state: AccessRights.getStatus().state, readOnly: AccessRights.get().readOnly, enabled: !!(config && config.cleanReading) });
  }

  // La fenêtre des nouveautés s'ouvre toute seule, une fois par personne, à la première ouverture après une version qui en a (js/whats-new.js) : pour qui écrit, les droits confirmés (comme la Lecture épurée d'emblée, une
  // personne qui démarre verrouillée par précaution n'est pas une personne en lecture seule : une table des droits qui répond après le délai du démarrage lui ouvre la fenêtre à la réponse, sur la Lecture où le verrou l'a
  // mise) - ni sur la Lecture épurée, ni sur la carte de l'accès. Appelée à la fin d'init() puis à chaque changement de droits (jamais avant la fin du démarrage : le premier modèle n'est pas encore affiché) ;
  // WhatsNew s'en souvient : une seule ouverture par séance.
  let newsMayOpen = false;
  function openNewsForEditors() {
    if (!newsMayOpen) return;
    WhatsNew.openOnFirstConnection(() => ({
      answered: CleanReading.isAnswered(AccessRights.getStatus().state),
      readOnly: isReadOnly(),
      usable: !CleanReading.isActive() && !ReaderGuide.editorLacksAccess(),
    })).catch(e => console.warn('[main] fenêtre des nouveautés non ouverte', e));
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
  // Ce qui est « à enregistrer » comprend un RÉGLAGE de cette personne (nom, e-mail, marges...), pas seulement du texte. Pendant l'écriture en direct, c'est ce qui fait écrire aussi une personne autre
  // que celle qui enregistre le modèle pour tout le monde (autosaveTickBlocked, js/live-entry.js).
  let autosaveSettingsDirty = false;
  // La date d'un enregistrement venu d'ailleurs, déjà attendue une fois : celui qui l'a fait, s'il écrit en direct, l'annonce dans la seconde (runAutosaveTick).
  let conflictDeferredFor = null;
  let autosaveLastKnownDateModif = null;
  // Dernière fois que le modèle ouvert a été comparé à Grist (performance.now : l'horloge du système peut reculer) : un passage qui a lu, ou le
  // chargement du modèle, qui vient de Grist.
  let autosaveLastCheckAt = -Infinity;
  let autosaveConflictActive = false;
  let autosaveConflictTpl = null;
  let autosaveTimer = null;
  // La question « Enregistrer / Abandonner / Annuler » est posée (askBeforeLeaving) : l'enregistrement automatique n'écrit rien pendant ce temps,
  // sinon « Abandonner » ne laisserait rien à abandonner - ce que la personne a tapé serait déjà enregistré. `leavePromptCount` : les demandes en route
  // (la question attend d'abord le passage en cours) ; le drapeau ne retombe qu'avec la dernière.
  let leavePromptOpen = false;
  let leavePromptCount = 0;
  // Une restauration de version est en cours (restoreVersionOnScreen) : l'enregistrement automatique ne part pas, il écrirait l'ancien écran par-dessus la version restaurée.
  let restoringVersion = false;
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
  // Le temps que la question « Enregistrer / Abandonner / Annuler » laisse à un passage déjà parti pour finir d'écrire (askBeforeLeaving) : un passage normal dure bien moins, Grist lent quelques secondes.
  const LEAVE_PROMPT_TICK_WAIT_MS = 8000;

  // Le réglage est gardé par js/person-store.js (le navigateur, ou GFS quand elle héberge le widget).
  function isAutosaveEnabled() {
    return PersonStore.get(AUTOSAVE_ENABLED_STORAGE) !== 'false'; // absent = activé par défaut ; stockage indisponible (navigation privée, quota) : lu absent, donc activé, plutôt que figé désactivé
  }

  function setAutosaveEnabled(enabled) {
    PersonStore.set(AUTOSAVE_ENABLED_STORAGE, enabled ? 'true' : 'false'); // non retenu (stockage indisponible) : actif pour cette session
  }

  // Aspect du bouton Enregistrer d'après ce réglage : bleu et blanc enregistrement automatique allumé, noir et blanc coupé. Deux classes le disent :
  // celle du bouton, et celle de <html> (pp-autosave-off), que le <head> d'index.html pose avant le premier affichage (le stockage du navigateur : chez GFS
  // il est refusé, l'espace de l'app n'arrive qu'avec le contexte) ; posée ici, à la fin du chargement des scripts, elle arriverait après un premier affichage
  // en bleu suivi d'un fondu vers le noir chez qui a coupé l'enregistrement automatique. Remise à l'heure au début d'init, à chaque clic de la ligne du menu,
  // quand un autre onglet change le réglage et quand l'espace de GFS arrive (PersonStore.onLoaded, dans init).
  function syncSaveButtonLook() {
    const off = !isAutosaveEnabled();
    document.documentElement.classList.toggle('pp-autosave-off', off);
    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.classList.toggle('is-autosave-off', off);
  }

  function markAutosaveDirty() { autosaveEditVersion++; autosaveDirty = true; autosaveSettingsDirty = true; updateSaveStatus(); }
  // Du texte tapé ici, ou reçu d'une autre personne de l'écriture en direct : à enregistrer, sans que ce soit un réglage de cette personne.
  function markTextDirty() { autosaveEditVersion++; autosaveDirty = true; updateSaveStatus(); }
  // Une écriture vient de partir avec l'état de l'éditeur tel qu'il était à la version `editVersion` : ce qui a été tapé depuis reste « à
  // enregistrer » pour le passage suivant.
  function noteSaved(editVersion) { if (editVersion === autosaveEditVersion) { autosaveDirty = false; autosaveSettingsDirty = false; } }

  function resetAutosaveState(tpl) {
    autosaveEpoch++;
    autosaveDirty = false;
    autosaveSettingsDirty = false;
    conflictDeferredFor = null;
    autosaveLastKnownDateModif = tpl ? tpl.dateModif : null;
    SlideLinks.noteKnown(tpl);
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
    if (leavePromptOpen || restoringVersion) return true;
    if (!isAutosaveEnabled()) return true;  // coupé par la personne (cf. wireSaveMenu) : ni vérification de conflit ni écriture en arrière-plan
    if (exportOperationInProgress) return true; // évite toute contention Grist avec un export en cours
    if (autosaveConflictActive) return true; // gelé tant que l'utilisateur n'a pas choisi (recharger, ou Enregistrer manuellement pour garder sa version)
    // Écriture en direct : UNE personne enregistre le modèle pour tout le monde (js/live-entry.js) ; les autres n'écrivent que ce qui leur est propre (un réglage).
    if (LiveEntry.blocksAutosave(autosaveSettingsDirty)) return true;
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
  async function writeAutosave(id, { nom, isMacro }, remoteTpl, epoch, editVersion, synced) {
    try {
      const suiviModifications = isMacro ? null : await Editor.getSuiviModificationsForSave();
      // un autre modèle a été choisi pendant l'attente de l'identification : l'éditeur n'est plus celui dont `id` est la ligne (cf. onSave)
      if (epoch !== autosaveEpoch) return;
      // La question « Enregistrer / Abandonner / Annuler » s'est ouverte depuis le départ de ce passage (leavePromptOpen n'est regardé qu'au départ) : rien n'est écrit, ce qui attend reste à demander,
      // et le passage suivant l'écrira si la personne reste.
      if (leavePromptOpen) return;
      // Les modèles viennent d'être relus par ce passage : les tableaux liés que le document a changé et pas leur modèle partent dans le même lot que sa ligne.
      const send = linkedSendFor(isMacro);
      const token = isMacro ? null : LiveEntry.saveToken(); // l'état du texte juste avant qu'il soit lu (écriture en direct)
      const contenu = isMacro ? remoteTpl.contenu : (send ? send.html : Editor.getHTML());
      const { dateModif } = await saveScreenAs(id, nom, suiviModifications, contenu, send ? send.writes : null);
      LiveEntry.published(token, dateModif);
      // Un autre modèle chargé pendant l'écriture (autosaveEpoch) a son propre état : rien de ceci ne lui appartient.
      if (epoch === autosaveEpoch) {
        autosaveLastKnownDateModif = dateModif;
        noteSaved(editVersion);
        if (send) send.commit();
        noteKnownState(id);
        updateSaveStatus();
        LinkedTable.tell(synced, send); // « Enregistré à… » ne doit pas effacer ce que la synchro et l'envoi viennent de dire
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
    adoptTableName(); // un nom donné ailleurs depuis l'ouverture (GFS) : le titre le prend avant que ce passage n'écrive
    const remoteTpl = remote.remoteTpl;
    if (changedElsewhere(remoteTpl)) {
      // Une personne du direct vient d'enregistrer : sa date est annoncée dans la seconde (adoptLiveSave), le conflit n'est dit qu'au passage d'après, une fois par date inconnue. Le passage suivant relit.
      const seen = String(remoteTpl.dateModif);
      if (LiveEntry.expectsAnnouncement() && conflictDeferredFor !== seen) { conflictDeferredFor = seen; autosaveLastCheckAt = -Infinity; return; }
      // Une présentation dont seules des diapositives à repère ont changé (l'envoi d'une présentation qui les a importées) les prend sans bandeau : sa date devient celle que ce widget connaît, et
      // ce qui était à enregistrer l'est toujours (js/slide-links.js:adopt).
      if (!SlideLinks.adopt(EditorCore.getEditor(), remoteTpl)) { showConflictBanner(remoteTpl); return; }
      autosaveLastKnownDateModif = remoteTpl.dateModif;
    }
    // Les modèles viennent d'être relus : les tableaux liés du document suivent les leurs, document modifié ou non, en lecture seule aussi (rien n'est écrit).
    const synced = followLinkedModels();
    if (!autosaveDirty) return;
    // Lecture seule : la vérification de conflit ci-dessus garde son bandeau (le modèle a changé ailleurs), mais rien n'est écrit. Un commentaire
    // posé en Lecture passe par saveReaderCommentAnchors, jamais par ici.
    if (isReadOnly()) return;
    // getHTML() renverrait le fragment d'en-tête ou de pied chargé, pas le document principal (cf. header-footer-preview.js) : on saute ce passage
    // plutôt que de forcer la sortie de ce mode toutes les 2 à 3 s, bien plus gênant que d'attendre le suivant.
    if (Editor.isEditingHeaderFooter()) return;
    const editVersion = autosaveEditVersion; // Avant de lire quoi que ce soit : ce qui est modifié après reste « à enregistrer » (cf. noteSaved)
    const target = autosaveWriteTarget(remoteTpl);
    if (target) await writeAutosave(id, target, remoteTpl, epoch, editVersion, synced);
  }

  function startAutosaveLoop() {
    if (autosaveTimer) return;
    autosaveTimer = setInterval(autosaveTick, AUTOSAVE_INTERVAL_MS);
  }

  // Menu « Enregistrer » : le bouton garde son geste (un clic, un enregistrement) et son survol ouvre « Enregistrer sous… » (une copie), « Historique des
  // versions… » (openVersionHistory) et la case « Enregistrement automatique » (cochée par défaut). Même mécanisme que les autres boutons à menu (.v2-hover-group, css/editor-v2.css).
  // - Le bouton ne prend pas le focus à la souris, comme tout bouton à menu au survol (délégation de js/editor-core.js) : sinon son menu
  //   (:focus-within) resterait affiché une fois la souris partie, et le curseur quitterait le texte. Un champ de saisie qui l'avait (renommage…) le
  //   perd au clic, avant onSave : le nom validé est bien celui qui s'enregistre. Les lignes du menu, des <span tabindex="0">, sont traitées de même.
  // - Entrée et Espace agissent sur les lignes, qui restent ainsi atteignables au clavier ; le menu reste ouvert tant que le focus est dedans. Au
  //   clavier, « Enregistrer sous… » met d'abord le focus sur le bouton : la fenêtre qu'elle ouvre le lui rend à sa fermeture, ce qu'une ligne de
  //   menu refermée ne pourrait pas recevoir.
  // - La boucle setInterval de l'enregistrement automatique tourne toujours une fois démarrée ; seul autosaveTick teste isAutosaveEnabled. Décocher
  //   la case fait donc sauter les passages sans rien arrêter ni recréer (une lecture du réglage toutes les 2,5 s).
  function wireSaveMenu() {
    const saveBtn = document.getElementById('btn-save');
    const saveAsRow = document.getElementById('v2-btn-save-as');
    const historyRow = document.getElementById('v2-btn-history');
    const autosaveRow = document.getElementById('v2-btn-autosave');
    if (!saveBtn) return;
    const holdFocus = (event) => event.preventDefault();
    const blurTextField = () => {
      const active = document.activeElement;
      if (EditorCore.isFormFieldFocus(active)) active.blur();
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
    wireRow(historyRow, (viaKeyboard) => { if (viaKeyboard) saveBtn.focus(); openVersionHistory(); });
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
  // Une présentation marque ses sauts de page pour la Lecture et les exports (SlidesEntry.outputHtml : la page de sa dernière diapositive s'ouvre même vide). `options` : { keepProps } garde le repère
  // de chaque diapositive (transition, fond, notes de l'intervenant), que seul le PowerPoint reprend.
  async function currentDocumentHtml(tableId, record, options) {
    if (currentTypeModele !== 'macro') return SlidesEntry.outputHtml(currentTypeModele, Editor.getHTML(), options);
    if (!record || !tableId) return '';
    return MacroTemplates.buildConcatenatedHtml(getCurrentMacroSlots(), tableId, record, LinkedTable.resolveTemplates(EditorCore.getEditor(), Templates.getCached()), perModelOption());
  }

  // « Selon chaque modèle » (PageLayout.isOrientationAuto) : le macro-modèle chargé laisse chaque modèle assemblé garder le sens de sa page. L'assemblage (MacroTemplates) le dit dans
  // le HTML, d'où la Lecture, le PDF, le Word et l'impression tournent leurs pages ; un sens imposé n'ajoute rien.
  function perModelOption(perModel = PageLayout.isOrientationAuto()) { return { perModel }; }

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
    const html = async () => (readerCommentsActive() ? SlidesEntry.outputHtml(currentTypeModele, await Comments.buildReaderHtml()) : currentDocumentHtml(tableId, record));
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
      const token = LiveEntry.saveToken(); // l'état du texte juste avant qu'il soit lu (écriture en direct)
      const { dateModif } = await saveScreenAs(id, nom, suiviModifications);
      LiveEntry.published(token, dateModif);
      if (epoch === autosaveEpoch) {
        autosaveLastKnownDateModif = dateModif;
        noteSaved(editVersion);
        noteKnownState(id);
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

  // Bascule l'affichage d'Objet/À/Cc/Cci entre gabarit brut (édition) et valeurs résolues (lecture) sur les mêmes champs, jamais dupliqués (cf.
  // emailFieldsRawCache ci-dessus). La valeur résolue s'écrit par showText : un texte, que le champ ne relit pas comme un modèle. Sans ligne sélectionnée, les gabarits bruts restent affichés (rien à résoudre) plutôt qu'un champ vidé sans
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
    eachEmailInput((input, key) => { input.showText(resolved[key]); });
  }

  // L'URL mailto: de cette ligne : les champs résolus, et le corps lu dans le rendu de la Lecture (ReaderMode.render : mêmes bulles et chips que le
  // PDF). `stale` (facultatif) rend vrai quand un résultat plus récent a pris le relais : l'URL n'est alors pas construite (null).
  async function buildMailtoForRecord(record, tableId, stale) {
    const fields = await resolveEmailFieldsForRecord(getEmailFieldsFromInputs(), tableId, record);
    await renderReader(record, tableId);
    if (stale && stale()) return null;
    const content = readerContainer.querySelector('.reader-content');
    const bodyText = MailtoExport.plainTextFromHtml(content ? content.innerHTML : readerContainer.innerHTML);
    return MailtoExport.buildMailtoUrl({ to: fields.destinataires, cc: fields.cc, bcc: fields.cci, subject: fields.objet, bodyText, client: MailtoExport.getMailClient() });
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
  const EXPORT_CONTROL_IDS = ['btn-export-pdf', 'v2-btn-export-pdf', 'v2-btn-export-pdf-batch', 'v2-btn-export-pdf-merged', 'v2-btn-export-pdf-sheets', 'v2-btn-export-docx', 'v2-btn-export-docx-batch', 'v2-btn-export-xlsx',
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
  function setExportDoneStatus(text, note) {
    const unread = ExportCommon.unreadImageCount();
    const done = unread ? I18n.t('status.imagesUnread', { n: unread }) + ' ' + text : text;
    // `note` : ce qui n'a pas pu se faire après l'export (stampExportDate), en tête et en rouge - le coin d'état coupe à droite, et le fichier, lui, est bien produit.
    setStatus(note ? note + ' ' + done : done, !!note);
  }

  // La date du dernier export PDF (js/export-date.js), écrite une fois le fichier produit pour ces lignes. Rend ce qu'il faut dire quand elle n'a pas pu l'être,
  // '' sinon (rien à écrire, écrite, ou compte Lecteur). Tout nouveau chemin d'export PDF l'appelle après son téléchargement.
  async function stampExportDate(tableId, rowIds) {
    const problem = await ExportDate.stamp(tableId, rowIds);
    return problem ? I18n.t('status.exportDate.' + problem.reason, { column: problem.column }) : '';
  }

  // Le document de la ligne courante pour un export seul : { html, headerFooterData } - ceux du modèle, avec la valeur de chaque liste réglée « Un
  // document par valeur » (js/list-split.js) quand elle n'en a qu'une -, ou { split } quand la ligne fait plusieurs documents : l'appelant passe
  // alors à l'archive d'onExportBatch (PDF, Word ou Excel, un fichier par valeur). Sans liste ainsi réglée, le HTML et les en-têtes du modèle, tels
  // quels.
  async function currentRecordDocument(tableId, record, options) {
    const html = await currentDocumentHtml(tableId, record, options);
    const headerFooterData = Editor.getHeaderFooterData();
    const plan = await ListSplit.plan(ListSplit.partsOf(html, headerFooterData), tableId, record);
    if (plan.variants.length > 1) return { split: { record, plan, html } };
    return { html: ListSplit.pin(html, plan.variants[0]), headerFooterData: ListSplit.pinHeaderFooter(headerFooterData, plan.variants[0]) };
  }

  // Les exports d'une seule ligne : le lot que prend son document quand « Un document par valeur » le découpe, l'alerte sans ligne, les textes du
  // coin d'état et l'export lui-même (`doc` : { html, headerFooterData }, cf. currentRecordDocument), et `stampsExportDate` pour le PDF seul : la date de son dernier
  // export s'écrit dans la colonne choisie (js/export-date.js). Word n'a ni sélecteur de qualité ni autre mode
  // (cf. en-tête de js/docx-export.js). Le type choisi dans le menu « Type d'export » (selectedExportType) décide lequel part au bouton Exporter. Excel exporte le tableau d'une grille, sans en-tête ni pied de page ni marges du document : la feuille
  // reprend l'orientation et les marges de PageLayout. `engines` : les moteurs de js/export-engines.js que `run` appelle, chargés au premier export. Le PDF d'une
  // présentation ne demande jamais « Exporter quand même ? » pour une page blanche : chacune est une diapositive (SlidesEntry.showsEveryPage).
  const SINGLE_EXPORTS = {
    pdf: {
      engines: ['pdf'],
      batch: 'pdfZip', noRecord: 'alert.noRecordForExport', generating: 'status.pdfGenerating', generated: 'status.pdfGenerated', failed: 'status.pdfGenerationError',
      stampsExportDate: true,
      run: (doc, tableId, record) => PdfExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, PageLayout.getMarginsPt(), undefined, pdfImageQuality(), undefined, SlidesEntry.showsEveryPage(currentTypeModele)),
    },
    // « PDF protégé » (type du menu Type d'export) : le même PDF vectoriel, chiffré avec le mot de passe, les autorisations et les propriétés que la fenêtre
    // (js/pdf-protection-dialog.js) vient de fixer, avant tout le reste (`protect`). « Impression navigateur » n'a pas de sens ici (le navigateur imprime, il ne chiffre pas) :
    // la qualité « Léger » seule s'applique. Un document découpé « Un document par valeur » reste un lot protégé (une archive ZIP).
    pdfProtected: {
      engines: ['pdf'], protect: true,
      batch: 'pdfProtectedZip', noRecord: 'alert.noRecordForExport', generating: 'status.pdfGenerating', generated: 'status.pdfProtectedGenerated', failed: 'status.pdfGenerationError',
      stampsExportDate: true,
      run: (doc, tableId, record, protection) => PdfExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, PageLayout.getMarginsPt(), undefined, pdfImageQuality(), PdfProtection.docFields(protection), SlidesEntry.showsEveryPage(currentTypeModele)),
    },
    // « Impression navigateur » (qualité du bouton PDF) : la Lecture, imprimée par le navigateur (js/print-export.js), sans moteur à charger. Un document
    // découpé « Un document par valeur » reste un lot : le lot PDF (archive ZIP), une impression ne faisant qu'un document.
    print: {
      engines: [],
      batch: 'pdfZip', noRecord: 'alert.noRecordForExport', generating: 'status.printPreparing', generated: 'status.printStarted', failed: 'status.printFailed',
      run: (doc, tableId, record) => PrintExport.printRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData),
    },
    docx: {
      engines: ['docx'],
      batch: 'docxZip', noRecord: 'alert.noRecordForExportDocx', generating: 'status.docxGenerating', generated: 'status.docxGenerated', failed: 'status.docxGenerationError',
      run: (doc, tableId, record) => DocxExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, PageLayout.getMarginsTwip()),
    },
    xlsx: {
      engines: ['xlsx'],
      batch: 'xlsxZip', noRecord: 'alert.noRecordForExportXlsx', generating: 'status.xlsxGenerating', generated: 'status.xlsxGenerated', failed: 'status.xlsxGenerationError',
      run: (doc, tableId, record) => XlsxExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate()),
    },
    // PowerPoint (js/pptx-export.js) : la présentation, une diapositive du fichier par diapositive, objets modifiables ; `keepProps` : le HTML garde le repère de chaque diapositive, d'où viennent sa transition, son fond et ses notes.
    pptx: {
      engines: ['pptx'], keepProps: true,
      batch: 'pptxZip', noRecord: 'alert.noRecordForExportPptx', generating: 'status.pptxGenerating', generated: 'status.pptxGenerated', failed: 'status.pptxGenerationError',
      run: (doc, tableId, record) => PptxExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, PageLayout.getMarginsPt()),
    },
    // Markdown (js/markdown-export.js) : le texte du document, sans marges ni pages ; comme le Word, il est fait pour un document, pas pour une grille.
    md: {
      engines: ['md'],
      batch: 'mdZip', noRecord: 'alert.noRecordForExportMd', generating: 'status.mdGenerating', generated: 'status.mdGenerated', failed: 'status.mdGenerationError',
      run: (doc, tableId, record) => MarkdownExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData),
    },
    // HTML (js/html-export.js) : le texte du document qui coule comme une page web, ni pages ni marges. `html` : le fichier complet à déposer sur un site ; `htmlFragment` : le contenu
    // seul à coller dans un bloc de page (`fragment`). Comme le Word et le Markdown, ils ne font que des documents.
    html: {
      engines: ['html'],
      batch: 'htmlZip', noRecord: 'alert.noRecordForExportHtml', generating: 'status.htmlGenerating', generated: 'status.htmlGenerated', failed: 'status.htmlGenerationError',
      run: (doc, tableId, record) => HtmlExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData),
    },
    htmlFragment: {
      engines: ['html'],
      batch: 'htmlFragmentZip', noRecord: 'alert.noRecordForExportHtml', generating: 'status.htmlGenerating', generated: 'status.htmlGenerated', failed: 'status.htmlGenerationError',
      run: (doc, tableId, record) => HtmlExport.exportCurrentRecord(doc.html, tableId, record, getPdfFilenameTemplate(), doc.headerFooterData, { fragment: true }),
    },
  };

  // Les réglages de « PDF protégé » pour la ligne affichée : ceux de la fenêtre tels quels, sauf pour « Un par ligne », où le mot de passe est celui de la cellule de CETTE ligne. La ligne
  // de l'écran (grist.onRecord) ne porte que les colonnes affichées : la ligne se relit en entier dans Grist, colonne des mots de passe comprise. Lève l'erreur de
  // PdfProtection.settingsForRow (`passwordProblem`, `column`) quand la cellule ne donne pas un mot de passe utilisable.
  async function protectionForRecord(protection, tableId, record) {
    if (protection.mode !== 'column') return protection;
    return PdfProtection.settingsForRow(protection, await GristAPI.fetchRowById(tableId, record.id, true));
  }

  async function exportRecordAs(kind) {
    const spec = SINGLE_EXPORTS[kind];
    Editor.exitHeaderFooterModeIfActive();
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert(exportText(spec.noRecord)); return; }
    // « PDF protégé » : la fenêtre du mot de passe d'abord, avant « Génération en cours… » - y renoncer ne lance rien. Elle vaut aussi pour le lot que découpe « Un document par valeur ».
    const tableId = currentTableId || GristAPI.getCurrentTableId();
    let protection;
    if (spec.protect) {
      protection = await PdfProtectionDialog.open({ table: tableId });
      if (!protection) { setStatus(I18n.t('status.exportCancelled')); return; }
    }
    setStatus(I18n.t(spec.generating));
    try {
      // « Un par ligne » : le mot de passe de CETTE ligne, lu maintenant ; sa cellule inutilisable arrête l'export avant tout travail (jamais un PDF sans le mot de passe attendu).
      if (protection) protection = await protectionForRecord(protection, tableId, record);
      const doc = await currentRecordDocument(tableId, record, { keepProps: !!spec.keepProps });
      if (doc.split) { await onExportBatch(spec.batch, doc.split, { protection }); return; }
      await ExportEngines.ensure(spec.engines);
      const saved = await spec.run(doc, tableId, record, protection);
      // « Annuler » sur la fenêtre des pages blanches (le PDF seul, js/pdf-export.js) : rien n'est enregistré, et la ligne n'est pas datée.
      if (saved === false) { setStatus(I18n.t('status.exportCancelled')); return; }
      setExportDoneStatus(I18n.t(spec.generated), spec.stampsExportDate ? await stampExportDate(tableId, [record.id]) : '');
    } catch (e) {
      // « Annuler » sur la fenêtre des images d'un site externe (js/external-images.js) : un choix, pas une erreur.
      if (ExternalImages.isCancel(e)) { setStatus(I18n.t('status.exportCancelled')); return; }
      // « Un par ligne » : la cellule de mot de passe de cette ligne ne sert pas (vide, trop longue...) - la phrase dit laquelle et quelle colonne, rien n'a été généré.
      if (e && e.passwordProblem) { setStatus(I18n.t('status.pdfPasswordProblem.' + e.passwordProblem, { column: e.column }), true); return; }
      // Un document de plus de PrintExport.MAX_PAGES pages : l'impression navigateur le refuse (son coût croît avec le carré du nombre de pages) ; ce n'est
      // pas une panne, la phrase dit quoi choisir à la place.
      if (PrintExport.isTooLong(e)) { setStatus(I18n.t('status.printTooLong', { n: e.pages, max: PrintExport.MAX_PAGES }), true); return; }
      console.error(e);
      setStatus(I18n.t(spec.failed), true);
    }
  }
  // Le type d'export (menu du bouton à gauche d'Exporter, ex-« Qualité PDF ») : PDF, PDF protégé, Word, Excel, Markdown, Markdown (modèle), HTML ou HTML (contenu à coller), gardé dans la liste cachée
  // #v2-export-type comme la qualité du PDF l'est dans #v2-pdf-quality. Word, Markdown et HTML n'ont de sens que pour un document (un macro-modèle compris) et Excel que pour une
  // grille ; « Markdown (modèle) » écrit le contenu du modèle ouvert (ses variables comprises), donc ni une grille ni un macro-modèle, qui n'a pas de contenu à lui : un type
  // que le modèle ouvert ne sait pas faire n'est pas proposé (ligne grisée) et le bouton Exporter retombe sur le PDF, jamais sur une erreur.
  function exportTypeAvailable(type) {
    const grid = GridEditor.isGridType(currentTypeModele);
    return type === 'pdf' || type === 'pdfProtected' || ((type === 'docx' || type === 'md' || type === 'html' || type === 'htmlFragment') && !grid) || (type === 'xlsx' && grid)
      || (type === 'mdTemplate' && !grid && currentTypeModele !== 'macro') || (type === 'pptx' && currentTypeModele === 'presentation');
  }
  function selectedExportType() {
    const select = document.getElementById('v2-export-type');
    const type = select ? select.value : 'pdf';
    return exportTypeAvailable(type) ? type : 'pdf';
  }
  // La qualité du PDF : « Impression navigateur » imprime la Lecture par le navigateur, toute autre ligne garde le PDF vectoriel. Les lots (toutes les
  // lignes, PDF fusionné, planches) restent vectoriels et suivent « Léger » comme le PDF d'une ligne : il ne change que le poids des images (PdfExport,
  // ImageIo.lighten), jamais la page.
  function selectedPdfQuality() {
    const select = document.getElementById('v2-pdf-quality');
    return select ? select.value : 'native';
  }
  // Ce que le moteur PDF reçoit de la qualité choisie : 'light' ramène les images à leur définition, toute autre ligne les reprend telles quelles.
  function pdfImageQuality() {
    return selectedPdfQuality() === 'light' ? 'light' : 'native';
  }
  const onExportPdf = () => exportRecordAs(selectedPdfQuality() === 'browser-print' ? 'print' : 'pdf');
  const onExportPdfProtected = () => exportRecordAs('pdfProtected');
  const onExportDocx = () => exportRecordAs('docx');
  const onExportPptx = () => exportRecordAs('pptx');
  const onExportXlsx = () => exportRecordAs('xlsx');
  const onExportMd = () => exportRecordAs('md');
  const onExportHtml = () => exportRecordAs('html');
  const onExportHtmlFragment = () => exportRecordAs('htmlFragment');
  // « Markdown (modèle) » : le modèle ouvert tel que l'éditeur le montre, ses variables écrites {{Table.Colonne}} et le reste de ses éléments de fusion en HTML en ligne
  // (js/markdown-export.js:exportTemplate), pour que l'import le relise intact. Ni ligne, ni valeur : rien à lire dans Grist, un seul fichier nommé d'après le modèle.
  async function onExportMdTemplate() {
    Editor.exitHeaderFooterModeIfActive();
    setStatus(I18n.t('status.mdGenerating'));
    try {
      await ExportEngines.ensure(['md']);
      await MarkdownExport.exportTemplate(SlideLinks.strip(Editor.getHTML()), Editor.getHeaderFooterData(), sanitizeFilenamePart(templateNameInput ? templateNameInput.value : ''));
      setExportDoneStatus(I18n.t('status.mdTemplateGenerated'));
    } catch (e) {
      console.error(e);
      setStatus(I18n.t('status.mdGenerationError'), true);
    }
  }
  // Les lignes que le bouton Exporter exporte (options du menu du bouton Exporter, demande du 12/10) : « une seule ligne » (la ligne affichée) ou
  // toutes les lignes de la table - un ZIP (un fichier par ligne), un seul PDF, l'assemblage avant impression, ou pour Excel un seul classeur. L'option cochée est
  // gardée dans la liste cachée #v2-export-lines. Chaque type n'a que ses lots (EXPORT_BATCH_OF) : une option que le type ne connaît pas (le PDF unique après un
  // passage à Word, le classeur unique après un retour au PDF) retombe sur « toutes les lignes (ZIP) » sans toucher au choix gardé, qui revient avec son type.
  const EXPORT_BATCH_OF = {
    pdf: { zip: 'pdfZip', merged: 'pdfMerged', sheets: 'pdfSheets' },
    // Le PDF protégé n'a ni PDF unique ni planche : pdf-lib, qui assemble des PDF, ne sait pas les chiffrer (lignes grisées dans le menu Exporter).
    pdfProtected: { zip: 'pdfProtectedZip' },
    docx: { zip: 'docxZip' },
    pptx: { zip: 'pptxZip' },
    xlsx: { zip: 'xlsxZip', workbook: 'xlsxSingle' },
    md: { zip: 'mdZip' },
    html: { zip: 'htmlZip' },
    htmlFragment: { zip: 'htmlFragmentZip' },
    // Le modèle n'est pas une ligne : un seul fichier, jamais de lot (le menu Exporter ne propose rien d'autre que le dire).
    mdTemplate: {},
  };
  const EXPORT_LINES = ['one', 'zip', 'merged', 'sheets', 'workbook'];
  function selectedExportLines(type) {
    const select = document.getElementById('v2-export-lines');
    const lines = select ? select.value : 'one';
    if (EXPORT_LINES.indexOf(lines) === -1 || lines === 'one') return 'one';
    if (EXPORT_BATCH_OF[type][lines]) return lines;
    return EXPORT_BATCH_OF[type].zip ? 'zip' : 'one';
  }
  // Le bouton Exporter (et Alt+P) : ce que le menu coche, dans le type choisi - la ligne affichée, ou tout un lot (avec sa confirmation, comme avant).
  const onExport = () => {
    const type = selectedExportType();
    const lines = selectedExportLines(type);
    if (lines !== 'one') return onExportBatch(EXPORT_BATCH_OF[type][lines]);
    return ({ pdf: onExportPdf, pdfProtected: onExportPdfProtected, docx: onExportDocx, pptx: onExportPptx, xlsx: onExportXlsx, md: onExportMd, mdTemplate: onExportMdTemplate, html: onExportHtml, htmlFragment: onExportHtmlFragment })[type]();
  };

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
      // Dans le cadre isolé de GFS, un lien mailto: suivi dans le cadre le ferait mourir : nouvel onglet (consigne GFS 011). Seule, rien ne change.
      if (GfsLink.opensInNewTab(url)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
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
    'exportLines.zip': 'exportLines.zipGrid',
    'exportLines.merged': 'exportLines.mergedGrid',
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
  // dans la page, grisée (même masquée) ; son clic ne fait rien (cf. onExportRow, au câblage des boutons). Les deux lignes PDF « toutes les lignes » et
  // leurs options du menu Exporter prennent aussi les mots de la grille. Les menus
  // d'export suivent ensuite (syncExportMenus) : le type Word ou Excel que le nouveau modèle ne sait pas faire revient au PDF.
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
    [['v2-btn-export-pdf-batch', 'toolbar.exportPdfBatch'], ['v2-btn-export-pdf-merged', 'toolbar.exportPdfMerged'],
      ['v2-export-lines-zip', 'exportLines.zip'], ['v2-export-lines-merged', 'exportLines.merged']].forEach(([id, key]) => {
      const row = document.getElementById(id);
      if (!row) return;
      const wanted = grid ? GRID_WORDING[key] : key;
      row.textContent = I18n.t(wanted);
    });
    syncExportMenus();
  }

  // Les deux menus d'export d'accord avec le type choisi, l'option de lignes cochée et le genre du modèle ouvert (on grise ou on masque ce qui ne s'applique
  // pas, les lignes restent dans la page) :
  // - menu « Type d'export » (#v2-quality-flyout) : la ligne du type choisi est active ; Word ou Excel, que le modèle ne sait pas faire, est grisé ; la qualité du
  //   PDF (intitulé, filet et trois lignes : `data-export-for="pdf pdfProtected"`) n'est montrée que pour les deux PDF - demande du 12/10 -, la qualité choisie est gardée
  //   et revient avec le PDF (hors des PDF ses lignes sont aussi grisées : un clic dessus ne choisit rien). En PDF protégé, « Impression navigateur » reste montrée mais grisée
  //   (`data-export-grey-for` : le navigateur imprime, il ne chiffre pas) et la ligne active est celle qui s'applique, « Vectoriel » si c'était l'impression ;
  // - menu « Exporter » (#v2-export-pdf-flyout) : seules les options du type choisi sont montrées (`data-export-for`, une liste de types) et celle que le bouton
  //   Exporter lance, selectedExportLines, est cochée (`aria-checked`). Une option que le type montre sans pouvoir la faire est grisée, avec sa raison en info-bulle
  //   (`data-export-grey-for` : le PDF unique et l'assemblage en PDF protégé, que pdf-lib assemble sans pouvoir les chiffrer) ;
  // - le bouton du type est allumé quand ce n'est pas le PDF, pour qu'on sache avant de cliquer sur Exporter que le fichier ne sera pas un PDF.
  // Un type que le modèle ne sait pas faire revient au PDF pour de bon (la liste cachée est remise), de sorte que le modèle suivant ne le retrouve pas.
  function syncExportMenus() {
    const typeSelect = document.getElementById('v2-export-type');
    const qualitySelect = document.getElementById('v2-pdf-quality');
    const typeFlyout = document.getElementById('v2-quality-flyout');
    const exportFlyout = document.getElementById('v2-export-pdf-flyout');
    const typeButton = document.getElementById('v2-btn-quality');
    if (!typeSelect || !qualitySelect || !typeFlyout || !exportFlyout || !typeButton) return;
    if (!exportTypeAvailable(typeSelect.value)) typeSelect.value = 'pdf';
    const type = typeSelect.value;
    const grey = (row, off) => {
      row.classList.toggle('v2-hover-row-disabled', off);
      if (off) row.setAttribute('aria-disabled', 'true'); else row.removeAttribute('aria-disabled');
    };
    typeFlyout.querySelectorAll('.v2-hover-row[data-export-type]').forEach(row => {
      row.classList.toggle('is-active', row.dataset.exportType === type);
      grey(row, !exportTypeAvailable(row.dataset.exportType));
    });
    // Une ligne grisée dit pourquoi en info-bulle ; une ligne qui ne l'est pas n'en porte pas.
    const greyedFor = (row, key) => {
      const off = (row.dataset.exportGreyFor || '').split(' ').indexOf(type) !== -1;
      if (off) row.title = I18n.t(key); else row.removeAttribute('title');
      return off;
    };
    const pdfType = type === 'pdf' || type === 'pdfProtected';
    typeFlyout.querySelectorAll('.v2-hover-row[data-quality]').forEach(row => {
      const applied = type === 'pdfProtected' && qualitySelect.value === 'browser-print' ? 'native' : qualitySelect.value;
      row.classList.toggle('is-active', pdfType && row.dataset.quality === applied);
      const notForProtected = greyedFor(row, 'quality.protectedOff');
      grey(row, !pdfType || notForProtected);
    });
    [typeFlyout, exportFlyout].forEach(flyout => flyout.querySelectorAll('[data-export-for]').forEach(el => {
      el.hidden = el.dataset.exportFor.split(' ').indexOf(type) === -1;
    }));
    const lines = selectedExportLines(type);
    exportFlyout.querySelectorAll('.v2-hover-row[data-export-lines]').forEach(row => {
      row.setAttribute('aria-checked', row.dataset.exportLines === lines ? 'true' : 'false');
      grey(row, greyedFor(row, 'exportLines.protectedOff'));
    });
    typeButton.classList.toggle('active', type !== 'pdf');
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
  // js/xlsx-export.js). Lit les lignes de la vue Grist, ou toute la table via docApi (cf. readBatchRows).
  // Ce qui change d'un export à l'autre : ses textes (clés i18n), le nom des fichiers, la fonction qui rend une ligne et ses marges (points pour le
  // PDF, twips pour le DOCX, aucune pour l'Excel dont la feuille reprend la page du modèle) et ses bibliothèques (`loadLibs` : l'archive ZIP n'a
  // besoin que de JSZip, ~0,1 Mo, pas du lot PDF de ~4 Mo). Le reste (lecture des lignes, confirmation, boucle, archive, téléchargement) est commun.
  // - `single` : pas de blob par ligne, le classeur unique reçoit une feuille par ligne.
  // - `grid` : le genre de modèle que l'export sait faire (faux : un document, Word ; vrai : une grille, Excel ; absent : les deux, PDF). Une ligne
  //   dont « Modèle selon la ligne » désigne un modèle d'un autre genre n'est pas générée (comptée en échec).
  // - `pageOptions` : la page d'une feuille Excel, lue sur les réglages de page posés (ceux de l'écran, ou ceux du modèle d'une ligne, cf.
  //   templateSource).
  // - `engines` : les moteurs de js/export-engines.js que l'export appelle. Ils ne se chargent qu'au premier export, et avant tout le reste : le plan du
  //   lot lit déjà la page de l'Excel, et la fenêtre des planches la géométrie des feuilles.
  const PDF_BATCH = {
    label: 'PDF', loading: 'status.loadingPdfLibs', loadError: 'status.pdfLibsLoadError', progress: 'status.batchExportProgress', noFile: 'status.exportError',
    engines: ['pdf'], margins: () => PageLayout.getMarginsPt(),
    // La date du dernier export PDF s'écrit pour les lignes du fichier (js/export-date.js) : les trois lots PDF, ZIP, PDF unique et planche.
    stampsExportDate: true,
    // Le PDF d'une ligne sait si son modèle est une grille (un lot « Modèle selon la ligne » peut mêler grilles et documents), et la qualité du menu Type d'export
    // choisie au départ du lot (`imageQuality`, cf. openBatchSink) : 'light' ramène les images à leur définition.
    // `docFields` : ceux d'un PDF protégé (js/pdf-protection.js), absents d'un PDF ordinaire. Le PDF d'une présentation ne signale aucune page blanche : chacune est une diapositive
    // (SlidesEntry.showsEveryPage).
    renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins, _pageOptions, typeModele, imageQuality, docFields) => PdfExport.getNativePdfBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, margins, GridEditor.isGridType(typeModele), imageQuality, docFields, SlidesEntry.showsEveryPage(typeModele)),
  };
  const BATCH_EXPORTS = {
    pdfZip: Object.assign({}, PDF_BATCH, {
      confirm: 'confirm.batchExport', done: 'status.batchExportDone', doneWithFailures: 'status.batchExportDoneWithFailures',
      entryExt: '.pdf', fileSuffix: '-export-pdf.zip',
      loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await ExportCommon.ensureJsZipLoaded(); },
    }),
    // « PDF protégé » en lot : les PDF d'une archive ZIP, chacun chiffré avec le même mot de passe (`protect` : la fenêtre js/pdf-protection-dialog.js tient lieu de confirmation).
    pdfProtectedZip: Object.assign({}, PDF_BATCH, {
      protect: true, confirm: 'confirm.batchExport', done: 'status.batchExportDoneProtected', doneWithFailures: 'status.batchExportDoneWithFailuresProtected',
      entryExt: '.pdf', fileSuffix: '-export-pdf-protege.zip',
      loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await ExportCommon.ensureJsZipLoaded(); },
    }),
    pdfMerged: Object.assign({}, PDF_BATCH, {
      confirm: 'confirm.mergedExport', done: 'status.mergedExportDone', doneWithFailures: 'status.mergedExportDoneWithFailures',
      splitDone: 'status.splitMergedDone', splitDoneWithFailures: 'status.splitMergedDoneWithFailures',
      merged: true, fileSuffix: '-export.pdf', engines: ['pdf', 'merge'],
      loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await PdfMerge.ensureLibLoaded(); },
    }),
    // Assemblage avant impression (js/sheet-assembly-dialog.js, js/sheet-layout.js) : les mêmes PDF par ligne que le PDF unique, posés sur des
    // feuilles A4 ou A3 (js/pdf-merge.js:createSheets). La fenêtre de réglage tient lieu de confirmation (`sheets`) ; le fichier sort sous le nom
    // `<table>-assemblage.pdf`.
    pdfSheets: Object.assign({}, PDF_BATCH, {
      done: 'status.sheetsExportDone', doneWithFailures: 'status.sheetsExportDoneWithFailures',
      splitDone: 'status.splitSheetsDone', splitDoneWithFailures: 'status.splitSheetsDoneWithFailures',
      merged: true, sheets: true, fileSuffix: '-assemblage.pdf', engines: ['pdf', 'merge', 'sheets'],
      loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await PdfMerge.ensureLibLoaded(); },
    }),
    docxZip: {
      label: 'DOCX', confirm: 'confirm.batchExportDocx', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressDocx',
      noFile: 'status.exportErrorDocx', done: 'status.batchExportDoneDocx', doneWithFailures: 'status.batchExportDoneWithFailuresDocx',
      entryExt: '.docx', fileSuffix: '-export-docx.zip', margins: () => PageLayout.getMarginsTwip(), grid: false, engines: ['docx'],
      loadLibs: () => ExportCommon.ensureJsZipLoaded(),
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins) => DocxExport.getDocxBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, margins),
    },
    // Un fichier .pptx par ligne, dans une archive ZIP (js/pptx-export.js) : la page du modèle est celle des diapositives, `keepProps` garde le repère de chacune (transition, fond, notes).
    pptxZip: {
      label: 'PowerPoint', confirm: 'confirm.batchExportPptx', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressPptx',
      noFile: 'status.exportErrorPptx', done: 'status.batchExportDonePptx', doneWithFailures: 'status.batchExportDoneWithFailuresPptx',
      entryExt: '.pptx', fileSuffix: '-export-pptx.zip', margins: () => PageLayout.getMarginsPt(), grid: false, engines: ['pptx'], keepProps: true,
      loadLibs: () => ExportCommon.ensureJsZipLoaded(),
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins) => PptxExport.getPptxBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, margins),
    },
    xlsxZip: {
      label: 'Excel', confirm: 'confirm.batchExportXlsx', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressXlsx',
      noFile: 'status.exportErrorXlsx', done: 'status.batchExportDoneXlsx', doneWithFailures: 'status.batchExportDoneWithFailuresXlsx',
      entryExt: '.xlsx', fileSuffix: '-export-xlsx.zip', grid: true, engines: ['xlsx'], pageOptions: () => XlsxExport.pageOptionsFromLayout(),
      loadLibs: async () => { await ExportCommon.ensureJsZipLoaded(); await XlsxExport.ensureExcelLibLoaded(); },
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins, pageOptions) => XlsxExport.getXlsxBlobForRecord(html, tableId, row, filenameTemplate, pageOptions || undefined),
    },
    // Un fichier .md par ligne, dans une archive ZIP : ni marges ni page, le texte seul (js/markdown-export.js) ; comme le Word, il ne fait que des documents.
    mdZip: {
      label: 'Markdown', confirm: 'confirm.batchExportMd', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressMd',
      noFile: 'status.exportErrorMd', done: 'status.batchExportDoneMd', doneWithFailures: 'status.batchExportDoneWithFailuresMd',
      entryExt: '.md', fileSuffix: '-export-md.zip', grid: false, engines: ['md'],
      loadLibs: () => ExportCommon.ensureJsZipLoaded(),
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData) => MarkdownExport.getMarkdownBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData),
    },
    // Un fichier .html par ligne, dans une archive ZIP : le fichier complet à déposer (`htmlZip`) ou le contenu seul à coller (`htmlFragmentZip`, dont les fichiers portent « -fragment »).
    // Ni marges ni page (js/html-export.js) ; comme le Word et le Markdown, ils ne font que des documents.
    htmlZip: {
      label: 'HTML', confirm: 'confirm.batchExportHtml', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressHtml',
      noFile: 'status.exportErrorHtml', done: 'status.batchExportDoneHtml', doneWithFailures: 'status.batchExportDoneWithFailuresHtml',
      entryExt: '.html', fileSuffix: '-export-html.zip', grid: false, engines: ['html'],
      loadLibs: () => ExportCommon.ensureJsZipLoaded(),
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData) => HtmlExport.getHtmlBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData),
    },
    htmlFragmentZip: {
      label: 'HTML', confirm: 'confirm.batchExportHtml', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressHtml',
      noFile: 'status.exportErrorHtml', done: 'status.batchExportDoneHtml', doneWithFailures: 'status.batchExportDoneWithFailuresHtml',
      entryExt: '-fragment.html', fileSuffix: '-export-html-fragment.zip', grid: false, engines: ['html'],
      loadLibs: () => ExportCommon.ensureJsZipLoaded(),
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData) => HtmlExport.getHtmlBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, { fragment: true }),
    },
    xlsxSingle: {
      label: 'Excel', confirm: 'confirm.singleWorkbookExport', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressXlsx',
      noFile: 'status.exportErrorXlsx', done: 'status.singleWorkbookDone', doneWithFailures: 'status.singleWorkbookDoneWithFailures',
      splitDone: 'status.splitSingleWorkbookDone', splitDoneWithFailures: 'status.splitSingleWorkbookDoneWithFailures',
      single: true, fileSuffix: '-export.xlsx', grid: true, engines: ['xlsx'], pageOptions: () => XlsxExport.pageOptionsFromLayout(),
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
      typeModele: currentTypeModele, isMacro, html: isMacro ? null : SlidesEntry.outputHtml(currentTypeModele, Editor.getHTML(), { keepProps: !!cfg.keepProps }), macroSlots: isMacro ? getCurrentMacroSlots() : null, perModelSense: isMacro && PageLayout.isOrientationAuto(),
      headerFooterData: Editor.getHeaderFooterData(), filenameTemplate: getPdfFilenameTemplate(), margins: cfg.margins ? cfg.margins() : null, pageOptions: null,
    };
  }

  // La source d'un autre modèle de la liste, tel qu'il est enregistré : rien n'est chargé dans l'éditeur ni changé à l'écran. Sa page est lue par les
  // fonctions de l'écran (PageLayout borne les marges et les convertit) : posée le temps de la lecture et rendue aussitôt, sans `await` entre les
  // deux - ni l'une ni l'autre n'est jamais affichée. Ses en-têtes et pieds passent par l'export comme ceux de l'écran (leur HTML y est assaini). Une présentation sans format à elle a la page
  // d'une diapositive, comme à l'écran, et ses sauts de page marqués comme ceux de l'écran (js/slides-entry.js).
  function templateSource(tpl, cfg) {
    const isMacro = tpl.typeModele === 'macro';
    const onScreen = PageLayout.getMarginsMm();
    let margins = null;
    let pageOptions = null;
    let perModelSense = false;
    PageLayout.setMarginsMm(SlidesEntry.pageFor(tpl.typeModele, tpl.marginsMm));
    try {
      margins = cfg.margins ? cfg.margins() : null;
      pageOptions = cfg.pageOptions ? cfg.pageOptions() : null;
      perModelSense = isMacro && PageLayout.isOrientationAuto();
    } finally { PageLayout.setMarginsMm(onScreen); }
    return {
      typeModele: tpl.typeModele || 'document', isMacro, html: isMacro ? null : SlidesEntry.outputHtml(tpl.typeModele, LinkedTable.resolveHtml(EditorCore.getEditor(), tpl.contenu || ''), { keepProps: !!cfg.keepProps }), macroSlots: isMacro ? (tpl.macroSlots || { slots: [] }) : null, perModelSense,
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
    return source.isMacro ? MacroTemplates.buildConcatenatedHtml(source.macroSlots, tableId, row, templatesCache, perModelOption(source.perModelSense)) : source.html;
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

  // Les lignes d'un export en lot : celles de la vue Grist - ses filtres, son tri -, ou toute la table (docApi, forme brute), au choix quand la vue n'en
  // montre qu'une partie (js/batch-scope.js) ; ou `only.record` seul. null : rien à exporter, ou la personne renonce ; le coin d'état dit pourquoi dans le
  // premier cas.
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
    const picked = await BatchScope.pick(rows, await BatchScope.viewRowIds(tableId), { table: tableId, grid: GridEditor.isGridType(currentTypeModele) });
    return picked && picked.rows;
  }

  // Au-delà de ce nombre de documents, l'export d'une seule ligne que « Un document par valeur » découpe demande d'abord (deux listes de 20
  // valeurs en font 400, deux de 100 en font 10 000, dans une archive construite en mémoire).
  const SPLIT_CONFIRM_FROM = 50;

  // L'accord avant un export en lot : `{}`, ou `{ layout }` pour les planches, qui se règlent dans leur propre fenêtre (feuille, emplacements, traits
  // de coupe) : elle tient lieu de confirmation. Un export seul n'en demande pas, son clic vaut accord, sauf quand sa ligne fait plus de
  // SPLIT_CONFIRM_FROM documents. null : la personne renonce.
  async function confirmBatch(cfg, { only, tableId, rowCount, jobCount, splitting, protection }) {
    // Un lot « PDF protégé » : la fenêtre du mot de passe tient lieu de confirmation (elle dit combien de PDF partent). Un document que « Un document par valeur » découpe l'a
    // déjà posée au départ de l'export (exportRecordAs, `protection`) : ici seule la question de ses nombreux documents peut encore se poser.
    if (cfg.protect && !protection) {
      const asked = await PdfProtectionDialog.open({ batch: true, count: jobCount, table: tableId, grid: GridEditor.isGridType(currentTypeModele) });
      if (!asked) setStatus(I18n.t('status.exportCancelled'));
      return asked ? { protection: asked } : null;
    }
    const setup = cfg.protect ? { protection } : {};
    if (only) {
      if (jobCount <= SPLIT_CONFIRM_FROM) return setup;
      const proceed = await Dialogs.confirm({ title: I18n.t('varList.split.label'), message: I18n.t('confirm.splitExport', { documents: jobCount }), confirmLabel: I18n.t('common.generate') });
      // « Génération en cours… » (exportRecordAs) ne doit pas rester affiché derrière un renoncement.
      if (!proceed) setStatus(I18n.t('status.exportCancelled'));
      return proceed ? setup : null;
    }
    if (cfg.sheets) return (await SheetAssemblyDialog.open({ count: jobCount, table: tableId, grid: GridEditor.isGridType(currentTypeModele) })) || null;
    const note = splitting ? '\n\n' + I18n.t('confirm.splitNote', { documents: jobCount }) : '';
    const proceed = await Dialogs.confirm({ title: exportText('dialog.batchExport.title'), message: exportText(cfg.confirm, { count: rowCount, table: tableId }) + note, confirmLabel: I18n.t('common.generate') });
    return proceed ? setup : null;
  }

  // Où un export en lot range ses documents : une archive ZIP (un fichier par document), un PDF unique (`merged`, ou `sheets` : posés sur des
  // planches) ou un classeur Excel unique (`single`). `add` reçoit le document tout prêt et rend, pour un PDF, `{ blankPages }` - les pages blanches de ce document ;
  // `finish` rend le fichier, `finishing` dit ce qui se passe pendant ce temps. `sheetCount` ne se lit qu'une fois `finish` terminé.
  async function openBatchSink(cfg, tableId, sheetSetup) {
    if (cfg.single) {
      const workbook = await XlsxExport.createSingleWorkbook();
      return {
        add: doc => workbook.appendRecord(doc.html, tableId, doc.row, doc.source.filenameTemplate, doc.valueName, doc.source.pageOptions || undefined),
        finish: () => workbook.toBlob(),
        finishing: 'status.xlsxAssembling',
      };
    }
    // La qualité choisie au départ de l'export vaut pour tout le lot : un changement de ligne dans le menu pendant qu'il tourne n'y change rien.
    const imageQuality = pdfImageQuality();
    // Un lot protégé : le mot de passe et les autorisations de la fenêtre pour chaque PDF - le mot de passe de sa ligne en mode « Un par ligne », et c'est cette ligne qui échoue, jamais
    // le lot, quand sa cellule ne sert pas -, chacun avec son propre mot de passe « propriétaire » tiré au hasard.
    const protection = sheetSetup && sheetSetup.protection;
    const render = doc => cfg.renderRow(doc.html, tableId, doc.row, doc.source.filenameTemplate, doc.headerFooterData, doc.source.margins, doc.source.pageOptions, doc.source.typeModele, imageQuality, protection ? PdfProtection.docFields(PdfProtection.settingsForRow(protection, doc.row)) : undefined);
    if (cfg.merged) {
      const pdf = await (cfg.sheets ? PdfMerge.createSheets(tableId, sheetSetup.layout) : PdfMerge.create(tableId));
      return {
        add: async doc => {
          const { blob, blankPages } = await render(doc);
          await pdf.append(blob);
          return { blankPages };
        },
        finish: () => pdf.toBlob(),
        finishing: cfg.sheets ? 'status.sheetsAssembling' : 'status.pdfMerging',
        sheetCount: () => (cfg.sheets ? pdf.sheetCount : 0),
      };
    }
    const zip = new JSZip();
    const usedNames = new Set();
    return {
      add: async doc => {
        const { blob, filename, blankPages } = await render(doc);
        const base = (sanitizeFilenamePart(filename) || ('document-' + doc.row.id)) + (doc.valueName ? ' - ' + doc.valueName : '');
        zip.file(uniqueZipFilename(base, usedNames) + cfg.entryExt, blob);
        return { blankPages };
      },
      finish: () => zip.generateAsync({ type: 'blob' }),
      finishing: 'status.zipCompressing',
    };
  }

  // `only` (facultatif) : la ligne courante seule - { record, plan, html } -, quand son document se découpe en plusieurs (« Un document par valeur »,
  // js/list-split.js) : une archive de ses documents, sans lire la table ni demander confirmation (le clic d'un export seul vaut accord), nommée
  // comme la ligne.
  // `preset` (facultatif) : ce que l'export seul a déjà demandé avant de partir en lot - { protection }, les réglages de la fenêtre « PDF protégé ».
  async function onExportBatch(kind, only, preset) {
    const cfg = BATCH_EXPORTS[kind];
    Editor.exitHeaderFooterModeIfActive();
    const tableId = currentTableId || GristAPI.getCurrentTableId();
    if (!tableId) { setStatus(I18n.t('status.currentTableNotFound'), true); return; }
    try {
      await ExportEngines.ensure(cfg.engines);
    } catch (e) {
      console.error('[main] export ' + cfg.label + ' en lot : échec de chargement du moteur', e);
      setStatus(I18n.t(cfg.loadError), true);
      return;
    }
    const rows = await readBatchRows(cfg, tableId, only);
    if (!rows) return;

    const { openSource, templatesCache, jobs, splitting } = await planBatchJobs(cfg, tableId, only, rows);
    const sheetSetup = await confirmBatch(cfg, { only, tableId, rowCount: rows.length, jobCount: jobs.length, splitting, protection: preset && preset.protection });
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
    const { ok, failed, cancelled, failures, blankRows, exportedIds } = await runBatchJobs(cfg, sink, jobs, { tableId, openSource, templatesCache });
    if (cancelled) { setStatus(I18n.t('status.exportCancelled')); return; }
    // Les lignes en échec, listées avec leur raison une fois le fichier téléchargé (ou, quand aucune n'a pu l'être, tout de suite) : la fenêtre se
    // referme avant que l'export libère ses contrôles.
    if (!ok) { setStatus(I18n.t(cfg.noFile), true); await BatchFailures.show(failures, { ok, format: cfg.label }); return; }

    await finishBatchExport(cfg, sink, { only, tableId, rows, openSource, splitting, ok, failed, exportedIds });
    await BatchFailures.show(failures, { ok, format: cfg.label });
    // Les PDF qui ont des pages blanches sont dans le fichier téléchargé : la fin du lot dit lesquels, pour les corriger et les refaire.
    await BatchFailures.showBlankPages(blankRows);
  }

  // Les documents à générer : un par ligne, ou un par valeur quand « Un document par valeur » découpe. Rend aussi ce que leur génération relit
  // (le modèle ouvert, le cache des modèles) et si l'un d'eux est un découpage.
  async function planBatchJobs(cfg, tableId, only, rows) {
    // Pas de HTML unique pour tout le lot : pour un macro-modèle, le choix des annexes dépend des valeurs de chaque ligne (cf. MacroTemplates), donc
    // la concaténation est refaite ligne par ligne dans la boucle de runBatchJobs ; un modèle normal garde le même gabarit pour toutes les lignes,
    // seule la résolution des #Variable change. Pas de modèle unique non plus quand « Modèle selon la ligne » est réglé : chaque ligne a la source
    // du modèle que ses règles lui donnent (rowSourceResolver), comme à l'écran.
    const templatesCache = LinkedTable.resolveTemplates(EditorCore.getEditor(), Templates.getCached());
    const openSource = openTemplateSource(cfg);
    const sourceOf = only ? async () => openSource : rowSourceResolver(tableId, cfg, openSource);
    // Compté avant la confirmation : « Un document par valeur » fait plus de documents que de lignes.
    const jobs = only ? only.plan.variants.map(variant => ({ row: only.record, source: openSource, rowHtml: only.html, variant }))
      : await planExportJobs(rows, { tableId, sourceOf, templatesCache });
    const splitting = jobs.some(job => ListSplit.hasPins(job.variant));
    return { openSource, templatesCache, jobs, splitting };
  }

  // Génère les documents un par un dans `sink`. cancelled : « Annuler » sur la fenêtre des images d'un site externe a arrêté tout le lot ;
  // failed : le nombre de lignes que leur modèle ou une erreur a empêché de générer, et failures : ces lignes mêmes, de quoi les reconnaître et la
  // raison, pour la fenêtre de fin de lot (js/batch-failures.js) ; blankRows : les lignes dont le PDF a des pages blanches, dans le fichier mais à revoir, pour la même
  // fenêtre ; exportedIds : les identifiants des lignes dont tous les documents sont dans le fichier, celles dont la
  // date du dernier export s'écrit (vide quand le lot est annulé).
  async function runBatchJobs(cfg, sink, jobs, { tableId, openSource, templatesCache }) {
    let ok = 0;
    let cancelled = false;
    const failedJobs = [];
    const blankJobs = [];
    const doneRows = new Set();
    const failedRows = new Set();
    for (let i = 0; i < jobs.length; i++) {
      const { row, variant, source } = jobs[i];
      setStatus(I18n.t(cfg.progress, { current: i + 1, total: jobs.length }));
      const valueName = variant && variant.label ? sanitizeFilenamePart(variant.label) : '';
      // Le modèle d'une ligne (« Modèle selon la ligne ») peut ne pas être du genre de cet export - une grille en Word, un document en Excel : la
      // ligne n'est pas générée, comme celle qui échoue.
      if (source !== openSource && cfg.grid != null && cfg.grid !== GridEditor.isGridType(source.typeModele)) {
        console.error('[main] export ' + cfg.label + ' en lot : le modèle de la ligne ' + row.id + ' (' + source.typeModele + ') ne se génère pas dans ce format');
        failedJobs.push({ row, source, valueName, wrongKind: cfg.grid ? 'document' : 'grid' });
        failedRows.add(row.id);
        continue;
      }
      try {
        // Le document de cette valeur : les bulles réglées « Un document par valeur » y écrivent leur k-ième valeur (js/list-split.js) ; sans
        // découpage, le HTML et les en-têtes sont ceux de la ligne, tels quels.
        const html = ListSplit.pin(jobs[i].rowHtml !== undefined ? jobs[i].rowHtml : await sourceRowHtml(source, tableId, row, templatesCache), variant);
        const added = await sink.add({ row, source, html, headerFooterData: ListSplit.pinHeaderFooter(source.headerFooterData, variant), valueName });
        ok++;
        doneRows.add(row.id);
        if (added && added.blankPages && added.blankPages.length) blankJobs.push({ row, source, valueName, pages: added.blankPages });
      } catch (e) {
        // « Annuler » sur la fenêtre des images d'un site externe arrête tout le lot, pas seulement cette ligne : rien n'est téléchargé.
        if (ExternalImages.isCancel(e)) { cancelled = true; break; }
        console.error('[main] export ' + cfg.label + ' en lot : échec pour la ligne', row.id, e);
        failedJobs.push({ row, source, valueName, message: e && e.message, passwordProblem: e && e.passwordProblem, column: e && e.column });
        failedRows.add(row.id);
      }
    }
    // Une ligne dont un document a échoué n'est pas datée, même si les autres sont dans le fichier (« Un document par valeur ») : la date dirait « exporté » d'une ligne
    // dont le PDF manque.
    const exportedIds = cancelled ? [] : Array.from(doneRows).filter(id => !failedRows.has(id));
    return { ok, failed: failedJobs.length, cancelled, failures: cancelled ? [] : await describeBatchFailures(failedJobs, tableId), blankRows: cancelled ? [] : await describeBatchFailures(blankJobs, tableId), exportedIds };
  }

  // Les lignes en échec (ou aux pages blanches : `pages`) telles que la fenêtre de fin de lot les liste (js/batch-failures.js) : leur n°, le nom que leur fichier aurait porté - celui du
  // modèle de la ligne, suivi de la valeur d'un « Un document par valeur » -, la raison. Une seule passe de lecture pour toutes (GristAPI.withReadPass),
  // avant le téléchargement : la fenêtre s'ouvre aussitôt après. Le nom n'est qu'un repère : illisible, la ligne se reconnaît à son n°.
  function describeBatchFailures(failedJobs, tableId) {
    if (!failedJobs.length) return [];
    return GristAPI.withReadPass(async () => {
      const failures = [];
      for (const { row, source, valueName, wrongKind, message, pages, passwordProblem, column } of failedJobs) {
        let name = '';
        try {
          if (source && source.filenameTemplate) name = sanitizeFilenamePart(await ReaderMode.resolveFilename(source.filenameTemplate, tableId, row));
        } catch (e) { name = ''; }
        failures.push({ id: row.id, name: valueName ? (name ? name + ' - ' : '') + valueName : name, wrongKind, message, pages, passwordProblem, column });
      }
      return failures;
    });
  }

  // La fin d'un export en lot : le fichier assemblé est téléchargé, le coin d'état dit combien de documents (et de planches) il contient.
  async function finishBatchExport(cfg, sink, { only, tableId, rows, openSource, splitting, ok, failed, exportedIds }) {
    setStatus(I18n.t(sink.finishing));
    const outBlob = await sink.finish();
    // Archive d'un export seul : nommée comme la ligne ; sinon comme la table.
    const outBase = only ? (sanitizeFilenamePart(await ReaderMode.resolveFilename(openSource.filenameTemplate, tableId, rows[0])) || sanitizeFilenamePart(tableId)) : sanitizeFilenamePart(tableId);
    ExportCommon.downloadBlob(outBlob, outBase + cfg.fileSuffix);
    const note = cfg.stampsExportDate ? await stampExportDate(tableId, exportedIds) : '';
    const sheets = sink.sheetCount ? sink.sheetCount() : 0;
    const useSplitTexts = splitting && cfg.splitDone;
    const doneKey = failed ? (useSplitTexts ? cfg.splitDoneWithFailures : cfg.doneWithFailures) : (useSplitTexts ? cfg.splitDone : cfg.done);
    setExportDoneStatus(exportText(doneKey, { ok, failed, sheets }), note);
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
    // Les graphiques de l'éditeur se redessinent pour la ligne et les données d'aujourd'hui : la Lecture a pu les changer pendant qu'ils étaient cachés.
    if (mode === 'edit') ChartEntry.refreshEditor();
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
    // Un tableau posé quand la page n'existait pas (ou chargé Aperçu A4 éteint) peut la dépasser : il y rentre dès qu'elle apparaît, sans attendre la
    // prochaine frappe. Éditeur masqué (Lecture, macro-modèle) : rien à mesurer, syncEditorVisibilityForMode le fera à son retour.
    if (on) withoutMarkingDirty(Editor.fitTablesToPage);
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
    // Entrée valide le nom (la liste # ouverte garde l'Entrée qui choisit une variable : l'évènement ne part pas dans ce cas).
    pdfFilenameInput.addEventListener('fieldenter', () => pdfFilenameInput.blur());
  }

  // Type d'export : bouton + panneau au survol plutôt qu'un <select> toujours affiché. Quatre lignes de type (PDF, PDF protégé, Word, Excel), puis la qualité du PDF
  // (le vectoriel par défaut, l'impression par le navigateur, « Léger » : le vectoriel aux images réduites), montrée pour les deux PDF seulement. Un clic sur une ligne
  // grisée ne choisit rien. Le menu du bouton Exporter se câble de même : un clic (ou Entrée, Espace) sur une option de lignes la coche, rien ne s'exporte.
  // Le bouton Exporter, onExportPdf et les lots lisent les valeurs choisies ; syncExportMenus tient les deux menus d'accord, aussi à chaque survol (un
  // appel direct a pu changer la liste cachée).
  function wireExportMenus() {
    const typeSelect = document.getElementById('v2-export-type');
    const qualitySelect = document.getElementById('v2-pdf-quality');
    const linesSelect = document.getElementById('v2-export-lines');
    const flyout = document.getElementById('v2-quality-flyout');
    const exportFlyout = document.getElementById('v2-export-pdf-flyout');
    const trigger = document.getElementById('v2-btn-quality');
    const exportTrigger = document.getElementById('btn-export-pdf');
    if (!typeSelect || !qualitySelect || !linesSelect || !flyout || !exportFlyout || !trigger || !exportTrigger) return;
    const choose = (select, value) => { select.value = value; syncExportMenus(); ExportChoices.remember(select.id, value); };
    const onRow = (row, select, value) => row.addEventListener('click', () => { if (!row.classList.contains('v2-hover-row-disabled')) choose(select, value); });
    flyout.querySelectorAll('.v2-hover-row[data-export-type]').forEach(row => onRow(row, typeSelect, row.dataset.exportType));
    flyout.querySelectorAll('.v2-hover-row[data-quality]').forEach(row => onRow(row, qualitySelect, row.dataset.quality));
    exportFlyout.querySelectorAll('.v2-hover-row[data-export-lines]').forEach(row => {
      onRow(row, linesSelect, row.dataset.exportLines);
      row.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        choose(linesSelect, row.dataset.exportLines);
      });
    });
    [trigger, exportTrigger].forEach(button => {
      const group = button.closest('.v2-hover-group');
      if (group) group.addEventListener('mouseenter', syncExportMenus);
    });
    syncExportMenus();
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
  // changement de touche.
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

  // Galerie de modèles : la fenêtre est celle de js/template-gallery-modal.js ; elle demande ici de changer le modèle de l'éditeur, de l'enregistrer
  // et de poser un message.
  function wireTemplateGalleryModal() {
    TemplateGalleryModal.wire({
      clearTemplateSelection: () => { templateSelect.value = ''; },
      loadTemplateIntoEditor, onSave, setStatus, hasEditsToConfirmBeforeLeaving, askBeforeLeaving, savedTemplateName,
      saveWatchdogMs: SAVE_WATCHDOG_MS,
    });
  }

  // Tout ce qui marque le brouillon « modifié » ou rafraîchit la jauge de l'email : l'éditeur, les champs du modèle et les réglages de page.
  function wireEditTracking() {
    // 'update' et non 'transaction' : ne part que si le document a réellement changé (docChanged), jamais pour un simple déplacement du curseur ou de
    // la sélection (cf. la section Enregistrement automatique plus haut). Couvre aussi l'édition de l'en-tête et du pied (même instance d'éditeur,
    // contenu échangé par setContent).
    // Hors la synchro des tableaux liés (js/linked-table.js:syncOpen) : un tableau qui suit son modèle n'est pas une modification de la personne, et ouvrir un document n'écrit rien.
    // Le texte reçu d'une autre personne de l'écriture en direct compte, il reste à enregistrer jusqu'à ce que l'une d'elles l'ait fait ; l'accroche du texte au salon (au démarrage) non.
    EditorCore.getEditor().on('update', ({ transaction }) => { if (!LinkedTable.isSyncTransaction(transaction) && !SlideLinks.isSyncTransaction(transaction) && !LiveEntry.isSettingUp()) markTextDirty(); });
    EditorCore.getEditor().on('update', scheduleEmailLengthGauge);
    if (templateNameInput) templateNameInput.addEventListener('input', markAutosaveDirty);
    if (pdfFilenameInput) pdfFilenameInput.addEventListener('input', markAutosaveDirty);
    // Les champs sont des éditeurs de bulles (js/field-editor.js) : la liste # n'y propose que des variables et les puces qui s'écrivent en texte (date,
    // heure, email et nom de l'utilisateur) - une note de bas de page, un bloc conditionnel ou un calcul n'ont aucun sens dans un objet ou une liste
    // d'adresses.
    eachEmailInput(el => {
      el.addEventListener('input', markAutosaveDirty);
      el.addEventListener('input', scheduleEmailLengthGauge);
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
    // Émis par MailtoExport.setMailClient (Réglages > Email) : le lien de l'email, donc sa longueur, change avec la messagerie choisie.
    document.addEventListener('pp:mailClientChanged', scheduleEmailLengthGauge);
  }

  // L'écriture en direct (extension « édition », js/live-entry.js) : ce que le socle lui dit du modèle ouvert, ce qu'elle peut lui demander, et l'enregistrement d'une autre personne du direct.
  // Sa date est celle que ce widget connaît maintenant (le passage suivant n'y voit pas un conflit) et, si le texte d'ici est dans l'état qu'elle a enregistré, rien n'est plus « à enregistrer ».
  function adoptLiveSave({ modified, atState }) {
    if (!LiveEntry.isLive()) return;
    autosaveLastKnownDateModif = modified;
    if (atState && !autosaveSettingsDirty) autosaveDirty = false;
    updateSaveStatus();
  }
  // Le texte affiché peut-il être remplacé par celui d'un direct déjà en cours (l'entrée automatique, js/live-entry.js) sans que la personne s'y attende ? Pas quand l'écran est à autre chose qu'à ce
  // texte : la Lecture, la carte de l'accès, une question de départ, une restauration de version, un export, un conflit à trancher, l'en-tête ou le pied en édition.
  function textMayBeReplaced() {
    return currentMode === 'edit' && !isAccessGuideShown() && !leavePromptOpen && !restoringVersion && !exportOperationInProgress && !autosaveConflictActive && !Editor.isEditingHeaderFooter();
  }
  function wireLiveEditing() {
    LiveEntry.setContext(() => ({ id: Templates.getCurrentId(), type: currentTypeModele, readOnly: isReadOnly(), dirty: autosaveDirty, modified: autosaveLastKnownDateModif, idle: textMayBeReplaced() }));
    LiveEntry.setHooks({ markUnsaved: markTextDirty });
    LiveEntry.onSaved(adoptLiveSave);
  }

  // L'ajustement de la page se refait tout de suite ; la pagination de l'éditeur une seule fois, en fin de tâche, et pas du tout si une autre a eu lieu entre-temps : l'ouverture d'un
  // modèle montre la bande puis pagine elle-même, et une pagination coûte sur une présentation chargée (70 diapositives d'images : 0,3 s, mesure du 21/10).
  let slidesRelayoutPending = false;
  function relayoutForSlides() {
    const readerChanged = applyPageFitZoom(readerContainer);
    applyPageFitZoom(editorContainer);
    if (readerChanged && currentMode === 'read') renderReader();
    if (slidesRelayoutPending) return;
    slidesRelayoutPending = true;
    queueMicrotask(() => {
      if (!slidesRelayoutPending) return;
      slidesRelayoutPending = false;
      if (currentMode === 'edit') Editor.refreshPaginationPreview();
    });
  }

  // Les présentations (extension « diapositives », js/slides-entry.js) : « Nouvelle présentation » ouvre un modèle vierge de ce type par le chemin des autres « Nouveau… ». Quand GFS allume ou
  // éteint une extension (son contexte arrive au démarrage, ou la personne change d'avis), les modèles qui s'ouvrent ici changent : la liste se redessine tout de suite, en gardant le modèle
  // qu'elle montre (même au démarrage, quand l'ouverture vient de le choisir). La bande des diapositives apprend ce que l'écran montre, et quand elle prend ou rend sa place à gauche du
  // document, la page se réajuste à la largeur qui reste et sa pagination se refait (relayoutForSlides).
  function wireSlides() {
    SlidesEntry.setContext(() => ({ type: currentTypeModele, editing: currentMode === 'edit' && editorContainer.style.display !== 'none' && !isReadOnly() }));
    SlidesEntry.setHooks({ startNew: startNewTemplate, relayout: relayoutForSlides, status: (msg, isError) => setStatus(msg, !!isError) });
    HeaderFooterPreview.onPaginated(() => { slidesRelayoutPending = false; });
    SlidesEntry.onChange(() => {
      const shown = templateSelect.value;
      renderTemplateOptions(Templates.getCached());
      templateSelect.value = shown;
    });
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

  // Les lignes de la vue de Grist ont changé (un filtre posé ou retiré, une ligne ajoutée ou modifiée ailleurs que sous le curseur) : la ligne choisie est la
  // même, onRecordChange n'a rien dit. Seule une Lecture qui boucle sur toutes les lignes (ReaderMode.readsAllRows) les montre : elle se redessine, une fois pour
  // une rafale de messages (un filtre en envoie plusieurs).
  const VIEW_REFRESH_MS = 250;
  let viewRefreshTimer = null;
  function onViewRowsChanged() {
    if (currentMode !== 'read' || !ReaderMode.readsAllRows()) return;
    clearTimeout(viewRefreshTimer);
    viewRefreshTimer = setTimeout(() => { if (currentMode === 'read' && ReaderMode.readsAllRows()) renderReader(); }, VIEW_REFRESH_MS);
  }

  // Les boutons de la barre : nouveau modèle, import, suppression, exports, création de l'email, modes Édition et Lecture.
  function wireToolbarButtons() {
    document.getElementById('btn-new').addEventListener('click', onNew);
    const btnNewDocument = document.getElementById('v2-btn-new-document');
    const btnNewEmail = document.getElementById('v2-btn-new-email');
    const btnNewMacro = document.getElementById('v2-btn-new-macro');
    const btnNewGrid = document.getElementById('v2-btn-new-grid');
    const btnNewPresentation = document.getElementById('v2-btn-new-presentation');
    if (btnNewDocument) btnNewDocument.addEventListener('click', onNew);
    if (btnNewEmail) btnNewEmail.addEventListener('click', onNewEmail);
    if (btnNewMacro) btnNewMacro.addEventListener('click', onNewMacro);
    if (btnNewGrid) btnNewGrid.addEventListener('click', onNewGrid);
    if (btnNewPresentation) btnNewPresentation.addEventListener('click', onNewPresentation);
    const btnImportXlsx = document.getElementById('v2-btn-import-xlsx');
    if (btnImportXlsx) btnImportXlsx.addEventListener('click', onImportXlsx);
    const btnImportMd = document.getElementById('v2-btn-import-md');
    if (btnImportMd) btnImportMd.addEventListener('click', onImportMd);
    MacroEditor.wire(onMacroSaved, macroSettingsOnScreen, openTemplateFromMacro, onMacroModelVisibility);
    TemplateOrganizeModal.wire();
    document.getElementById('btn-delete').addEventListener('click', onDelete);
    // Le bouton Exporter exporte, dans le type choisi (menu à sa gauche), l'option cochée de son menu : la ligne affichée ou toutes les lignes. Les neuf lignes
    // d'export d'avant, masquées (index.html), restent câblées à leur export comme avant, avec « Exporter en PDF » pour le PDF d'une ligne.
    document.getElementById('btn-export-pdf').addEventListener('click', withExportLock(onExport));
    document.getElementById('v2-btn-export-pdf').addEventListener('click', withExportLock(onExportPdf));
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

  // Le reste des branchements de l'interface : Lecture épurée, fenêtres, nom du fichier PDF, type d'export, raccourcis, bandeau de conflit, menu
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
    LinkedTable.wire({ setStatus, openModel: openLinkedModel });
    wireLinkRulesModal();
    wireTemplateGalleryModal();
    wireTemplateRename();
    wireDefaultTemplateButton();
    wirePdfFilenameToggle();
    wireExportMenus();
    Settings.wireSettingsModal({ hasEditsToConfirmBeforeLeaving, askBeforeLeaving }); // changer de langue recharge la page : la question « Enregistrer / Abandonner / Annuler » d'abord
    RowTemplatePanel.wire();
    ViewTemplate.wirePanel();
    ExportDate.wirePanel();
    wirePageModals();
    wireSaveShortcut();
    wirePageFitZoom();
    decorateSaveButtonShortcut();
    Shortcuts.onChange(decorateSaveButtonShortcut);
    wireAutosaveConflictBanner();
    wirePasteTooBigNotice();
    wireMacroReturn();
    wireLinkedReturn();
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
    // Hébergé par GFS, le réglage vient de l'espace de l'app, qui arrive avec le contexte : l'aspect du bouton se remet à l'heure à ce moment-là (js/person-store.js).
    PersonStore.onLoaded(syncSaveButtonLook);
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
    // Au plus ACCESS_STARTUP_WAIT_MS : le widget démarre verrouillé (lecture seule) tant que les droits ne sont pas connus. Une seule attente, quel que soit le nombre de fois qu'on la demande.
    let accessWait = null;
    const accessKnown = () => {
      if (!accessWait) accessWait = Promise.race([accessReady, new Promise(resolve => setTimeout(resolve, ACCESS_STARTUP_WAIT_MS))]);
      return accessWait;
    };
    ViewTemplate.init();
    ExportDate.init();
    SaveReminder.init();
    RowTemplate.init({
      openTemplate: openTemplateForRow,
      currentId: () => Templates.getCurrentId(),
      currentRecord: () => ({ record: latestRecord, tableId: latestRecordTableId }),
    });
    // GFS (js/gfs-open.js, consignes GFS 010 et 014) : le modèle qu'il désigne s'ouvre au démarrage, et son appel `ouvrir` passe par le chemin du sélecteur, comme la règle de ligne ; « Nouveau » ouvre un modèle vierge du type
    // demandé, par le chemin du bouton « Nouveau » de ce type. Seul, rien n'arrive.
    GfsOpen.init({ openTemplate: openTemplateForRow, openBlank: openBlankOfType, say: text => setStatus(text) });
    await editorReady;
    attachFieldEditors(await Editor.loadLibraries());
    Comments.setReaderHooks({ save: saveReaderCommentAnchors, refresh: () => renderReader() });
    Comments.wireReader(readerContainer);
    wireEditTracking();
    wireLiveEditing();
    wireSlides();
    GristAPI.onRecord(onRecordChange);
    BatchScope.onViewChange(onViewRowsChanged);
    await refreshTemplateList(templatesLoaded);
    // Enveloppe #template-select avant l'écriture de templateSelect.value ci-dessous (modèle par défaut) : TemplateTreeSelect intercepte cet
    // accesseur pour se synchroniser (js/template-tree-select.js), donc l'ordre importe ; attaché après, le premier affichage du modèle par défaut
    // serait manqué.
    // Le try/catch garde le reste du démarrage : init() n'a ailleurs aucun filet, et une exception dans cette vue décorative empêcherait de brancher
    // tout ce qui suit (Enregistrer, Ctrl+S, enregistrement automatique, statut « Prêt ») sans aucun message. Un bug de rendu de l'arbre doit rester
    // dans l'arbre.
    // `onOrganize` : « Organiser mes modèles » vit dans l'en-tête du panneau (js/template-tree-select.js). `onToggleDefault` et `isLocked` : l'étoile du modèle
    // par défaut qu'une ligne de la liste et de « Organiser » porte (toggleDefaultTemplate).
    try {
      TemplateTreeSelect.attach(templateSelect, {
        onOrganize: () => { if (!isReadOnly()) TemplateOrganizeModal.open(); },
        onToggleDefault: toggleDefaultTemplate,
        isLocked: isReadOnly,
      });
    } catch (e) { console.error('[main] TemplateTreeSelect.attach a échoué, arbre non disponible', e); }
    // Chargement non bloquant, comme Comments.loadForTemplate ci-dessous : l'identification de la personne (GristAPI.getCurrentUserEmail) est un
    // aller-retour réseau qui ne doit pas retarder le démarrage pour la section « Épinglés » de l'arbre.
    ExportChoices.wire({ canSave: () => !isReadOnly(), onApplied: syncExportMenus });
    TemplatePreferences.loadForCurrentUser()
      .then(() => { TemplateTreeSelect.refresh(); ExportChoices.refresh(); })
      .catch(e => console.error('[main] chargement des préférences de rangement impossible', e));
    // Modèle par défaut (cf. btn-set-default-template) : sélectionné avant la lecture de templateSelect.value ci-dessous, pour que le widget s'ouvre
    // directement dessus plutôt que sur "-- Nouveau modèle --". Silencieux si l'id ne correspond à aucune option (modèle supprimé entre-temps).
    // Réglage « Modèle selon la ligne » activé et la ligne déjà connue : le widget s'ouvre directement sur son modèle, sans passer par le modèle par
    // défaut.
    // Un rechargement que l'app a voulu elle-même (changer de langue, changer la touche de déclenchement : js/settings.js) ramène la personne sur le modèle où elle était (demande du 20/10), avant GFS, la ligne,
    // la vue et le ★. Son identifiant vient du fragment de l'adresse du cadre, effacé aussitôt, jamais du stockage du navigateur (le cadre isolé de GFS le refuse). Les extensions viennent du contexte de GFS
    // (une présentation ne s'ouvre que si « diapositives » est active) : on l'attend d'abord, comme js/gfs-open.js. Modèle supprimé entre-temps ou que ce widget ne sait pas ouvrir : l'ordre habituel, sans message.
    await GfsLink.ready;
    const reopenId = Settings.takeReopenId();
    const reopenedTemplate = reopenId == null ? undefined : Templates.openableById(reopenId);
    const reopenTemplateId = reopenedTemplate ? reopenedTemplate.id : null;
    // Hébergé par GFS : le modèle qu'il désigne (un double-clic dans son explorateur) passe avant tout l'ordre ci-dessous ; null seul, sans réponse de GFS ou quand ce modèle ne s'ouvre pas. Un modèle rouvert après
    // un rechargement passe avant lui : GFS ne rend l'`ouverture` qu'une fois (contrats 5.2, point 3), mais un GFS plus ancien la rejouerait, et le dernier clic n'est pas là où la personne était.
    const gfsTemplateId = reopenTemplateId == null ? await GfsOpen.startupTemplateId() : null;
    // « Nouveau » dans GFS (consigne 014) : un modèle vierge du type demandé s'ouvre à la place de tout l'ordre ci-dessous (le macro-modèle, qui n'a rien à charger, ouvre son écran de composition après le démarrage,
    // par-dessus le modèle habituel). Les droits se lisent d'abord : un document en lecture seule garde l'ordre habituel.
    const gfsBlankType = gfsTemplateId == null && reopenTemplateId == null ? await GfsOpen.startupBlankType() : null;
    let gfsBlankOpened = false;
    if (gfsBlankType !== null && gfsBlankType !== 'macro') {
      await accessKnown();
      gfsBlankOpened = (await openBlankOfType(gfsBlankType)) === true;
    }
    let startupRowTemplateId = null;
    if (gfsTemplateId == null && reopenTemplateId == null && !gfsBlankOpened && RowTemplate.isActive() && latestRecord) {
      try { startupRowTemplateId = await RowTemplate.pick(latestRecord, latestRecordTableId); }
      catch (e) { console.error('[main] modèle de la ligne introuvable au démarrage', e); }
    }
    // Ordre d'ouverture : le modèle rouvert après un rechargement voulu par l'app, puis celui que GFS désigne, puis la ligne qui désigne un modèle, puis le modèle choisi pour cette vue (js/view-template.js), puis
    // le modèle par défaut du document (★, jamais un modèle email ou macro : Templates.getDefaultId les ignore, même quand la colonne les marque encore).
    const startupTemplateId = [reopenTemplateId, gfsTemplateId, startupRowTemplateId, ViewTemplate.usableId(), Templates.getDefaultId()].find(id => id != null);
    if (!gfsBlankOpened) {
      if (startupTemplateId !== undefined) templateSelect.value = startupTemplateId;
      await onTemplateSelectChange();
    }
    templateSelect.addEventListener('change', onTemplateSelectChange);
    // Les lignes reçues avant ce point (modèles pas encore chargés) comptent maintenant ; la ligne déjà ouverte au démarrage ne rouvre rien - ni quand c'est GFS qui a désigné le modèle (ou demandé un modèle vierge) ni quand la personne retrouve celui d'avant son rechargement
    // ouvert : la ligne courante est alors tenue pour traitée, les suivantes suivent les règles comme d'habitude.
    RowTemplate.start(reopenTemplateId != null || gfsTemplateId != null || gfsBlankOpened).catch(e => console.error('[main] modèle selon la ligne non appliqué', e));
    wireToolbarButtons();
    wireWidgetControls();
    startAutosaveLoop();
    await accessKnown();
    applyAccessRights();
    AccessRights.onChange(onAccessRightsChange);
    GristAPI.onAccessLevelChange(onWidgetAccessChange);
    await switchMode('edit');
    FirstContact.ready();
    setStatus(I18n.t(isReadOnly() ? 'status.readyReadOnly' : 'status.ready'));
    // Juste après « Widget prêt. » : la phrase qui dit pourquoi ce modèle s'est ouvert (GFS) la remplace ; les avertissements de checkAfterOpen passent après elle, et les appels `ouvrir` reçus pendant le démarrage sont traités.
    GfsOpen.startupDone();
    // « Nouveau » dans GFS : le coin d'état garde l'avertissement « modèle non enregistré » que pose l'ouverture d'un modèle vierge, au lieu de « Widget prêt. » ; le macro-modèle ouvre son écran de composition, vide.
    if (gfsBlankOpened) updateSaveStatus();
    else if (gfsBlankType === 'macro') onNewMacro();
    openCleanReadingForReadOnly();
    checkAfterOpen();
    // Hébergée par GFS (consigne 019) : la page est partie dans la langue que son adresse porte ; si GFS en dit une autre (changée pendant le rechargement, qu'il ne signale pas à un cadre absent), elle
    // se recharge dans la bonne, après l'ouverture du modèle pour que le rechargement le rouvre. Rien seule, ni quand GFS ne donne pas la langue.
    Settings.followGfsLanguage();
    // Après elle : une page qui va se recharger dans la langue de GFS ne montre pas la fenêtre des nouveautés pour la rouvrir aussitôt.
    newsMayOpen = true;
    openNewsForEditors();
  }

  // Dernier filet de init() : hors TemplateTreeSelect.attach() (cf. ci-dessus), une exception interromprait l'initialisation en silence, sa seule
  // trace étant la console. Elle s'affiche ici dans le coin d'état.
  init().catch((e) => {
    console.error('[main] init() a échoué', e);
    setStatus(I18n.t('status.initError', { message: (e && e.message) || String(e) }), true);
    GfsOpen.startupFailed();
    FirstContact.failed(e);
  });
})();
