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
    // Grisé, il dit pourquoi en info-bulle (cause « state » de js/lock-reasons.js : un bouton `disabled` ne reçoit pas le clic).
    LockReasons.set(btn, 'state', btn.disabled ? I18n.t(currentId == null ? 'lock.defaultNone' : 'lock.defaultType') : '');
  }

  // Le ★ du document, posé sur le modèle `id` ou retiré s'il le porte déjà. Trois endroits y mènent : le bouton de la barre (le modèle ouvert), une ligne de
  // la liste des modèles et une ligne d'« Organiser mes modèles » (le modèle de la ligne, ouvert ou non). Un seul à la fois (Templates.setDefault) ; un email
  // et un macro-modèle ne le portent jamais. Le cache est à jour quand setDefault rend la main : la liste se redessine sans relire la table. Un clic pendant
  // une écriture est ignoré : le second lot partirait d'un cache qui ne porte pas encore le premier et laisserait deux modèles marqués dans Grist.
  let defaultTemplateWriting = false;
  // Ce que l'écran montre quand la bibliothèque a changé sans que le modèle ouvert change : la liste redessinée (`preloaded` : la lecture déjà faite ; sans elle, la table est relue), le modèle ouvert toujours choisi (un modèle pas encore enregistré n'a pas d'identifiant : l'option « Nouveau modèle »), le bouton de la barre.
  async function showTemplateList(preloaded) {
    await refreshTemplateList(preloaded);
    const openId = Templates.getCurrentId();
    templateSelect.value = openId == null ? '' : openId;
    syncDefaultTemplateButton();
  }
  // Une fois le ★ écrit, le cache est à jour : rien à relire.
  const showDefaultTemplate = () => showTemplateList(Templates.getCached());

  // Le ★ du document a passé de `from` à `to` (null : aucun modèle) : l'action de l'historique d'Annuler / Rétablir (js/action-history.js). Défaire le rend à `from`, rétablir le pose de nouveau sur `to`. Si le ★ n'est plus
  // sur ce que l'action avait laissé - une autre personne l'a changé depuis -, rien n'est écrit : le geste de l'autre n'est pas écrasé.
  function defaultTemplateAction(from, to) {
    const same = (a, b) => (a == null ? b == null : b != null && String(a) === String(b));
    async function put(target, expected) {
      while (defaultTemplateWriting) await new Promise(resolve => setTimeout(resolve, 30));
      if (isReadOnly()) throw new Error('lecture seule');
      if (!same(Templates.getDefaultId(), expected)) throw ActionHistory.conflict(I18n.t('history.defaultChanged'));
      const named = Templates.byId(target == null ? expected : target);
      if (!named) throw ActionHistory.conflict(I18n.t('history.templateGone'));
      defaultTemplateWriting = true;
      try {
        await Templates.setDefault(target);
        await showDefaultTemplate();
      } finally {
        defaultTemplateWriting = false;
      }
      return I18n.t(target == null ? 'status.defaultTemplateCleared' : 'status.defaultTemplateSet', { name: named.nom });
    }
    return { undo: () => put(from, to), redo: () => put(to, from) };
  }

  async function toggleDefaultTemplate(id) {
    const tpl = Templates.byId(id);
    if (!tpl || isReadOnly() || defaultTemplateWriting || !Templates.canBeDocumentDefault(tpl.typeModele)) return;
    defaultTemplateWriting = true;
    try {
      const wasDefault = Templates.isDefault(id);
      const before = Templates.getDefaultId();
      await Templates.setDefault(wasDefault ? null : id);
      await showDefaultTemplate();
      setStatus(I18n.t(wasDefault ? 'status.defaultTemplateCleared' : 'status.defaultTemplateSet', { name: tpl.nom }));
      ActionHistory.add(defaultTemplateAction(before, wasDefault ? null : id));
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
    const wasDirty = persist.autosaveDirty;
    action();
    if (!wasDirty && persist.autosaveDirty) { persist.autosaveDirty = false; persist.autosaveSettingsDirty = false; updateSaveStatus(); }
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
    if (!showEditor) { EditorCore.hideFloatingContextToolbars(); FindReplace.close({ focus: false }); TrackChangesPane.closePane({ focus: false }); }
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
    // Un PDF à l'écran (js/pdf-reading.js) se ferme dès qu'un modèle s'ouvre, quel que soit le chemin : le mode d'avant la lecture revient (onPdfReadingChange).
    PdfReading.close();
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
    // Les diapositives liées d'une présentation suivent leur source de même (js/slide-links.js:follow), et les copies en texte d'une diapositive, dans un document (js/slide-copies.js:follow), et les
    // diapositives d'une page de document, dans une présentation (js/page-copies.js:follow).
    const slides = SlideLinks.follow(editor, loading);
    const copies = SlideCopies.follow(editor);
    const pages = PageCopies.follow(editor);
    if (((synced && synced.pulled.length) || (slides && slides.pulled.length) || (copies && copies.pulled.length) || (pages && pages.pulled.length)) && currentMode === 'read') renderReader();
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
  let nameSession = null; // le geste de renommage que le crayon a ouvert : son repère d'Annuler se pose à la validation (HistoryMarkers, domaine « name ») ; null hors saisie
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
    nameSession = null;
  }

  // Le nom que la liste montre pour le modèle ouvert, tant qu'il n'est pas enregistré (même libellé que refreshTemplateList : l'étoile du modèle par défaut reste). Un modèle neuf sans nom reprend l'invite.
  function showNameInList(name) {
    if (!name) { resetNewOptionText(); return; }
    const opt = templateSelect.options[templateSelect.selectedIndex];
    if (opt) opt.textContent = Templates.isDefault(opt.value) ? name + ' ★' : name;
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
      nameSession = HistoryMarkers.begin('name');
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
      // La liste montre le modèle avec le nouveau nom jusqu'à l'enregistrement.
      if (templateNameInput.value.trim()) showNameInList(templateNameInput.value.trim());
      // Le renommage fini laisse son repère dans l'historique d'Annuler (rien si le nom n'a pas changé : Échap, un nom vide repris).
      if (nameSession) nameSession.commit({ alone: true });
      closeTemplateRenameEditor();
    }
    // Annuler et Rétablir (js/history-markers.js) rendent le nom d'avant ou d'après la validation. Si le modèle a été renommé depuis (l'explorateur de GFS, « Enregistrer sous » sous un autre nom), le champ ne montre plus
    // celui que le geste avait laissé : rien n'est changé, le coin d'état le dit.
    HistoryMarkers.define('name', {
      read: () => ({ name: templateNameInput.value.trim() }),
      write(next, prev) {
        if (templateNameInput.value.trim() !== prev.name) { setStatus(I18n.t('history.nameChanged'), true); return; }
        templateNameInput.value = next.name;
        showNameInList(next.name);
        markAutosaveDirty();
      },
    });
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

  // « Lire » un PDF demandé par GFS (js/gfs-open.js, consigne GFS 040 ; js/pdf-reading.js, extension « lecture-pdf ») : GFS donne le PDF qu'il garde et la Lecture le montre. Le PDF est lu d'abord (un PDF illisible ne coûte rien) ;
  // ensuite il quitte le modèle ouvert par le chemin d'un autre modèle - « Enregistrer / Abandonner / Annuler » s'il est modifié, puis un document vierge en dessous (rien d'écrit, comme « Nouveau ») - et le mode d'avant la
  // lecture est gardé pour être rendu quand un modèle s'ouvre. Un compte en lecture seule lit un PDF comme il lit un modèle. true : on peut continuer ; false : la personne reste (« Annuler »).
  let pdfReturnMode = null;
  async function leaveForPdf() {
    if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return false;
    pdfReturnMode = currentMode;
    startBlankDocument();
    return true;
  }
  // Le PDF arrive ou part : grisés, feuille de la Lecture, et à son départ le mode d'avant (l'édition) revient AVANT que le modèle qui le ferme se pose (loadTemplateIntoEditor appelle PdfReading.close en tête) : ce modèle
  // se charge dans l'éditeur montré, et ne se dessine pas deux fois dans la Lecture. Resté en Lecture avant le PDF, on y reste : le modèle posé s'y dessine (la fin de loadTemplateIntoEditor).
  function onPdfReadingChange(active) {
    applyPdfLocks();
    applyFormattingBarLock();
    ReaderMode.lend(active);
    const toggle = document.getElementById('v2-toggle-a4-preview');
    readerContainer.classList.toggle('a4-preview', active || (!!toggle && toggle.checked && !GridEditor.isGridType(currentTypeModele)));
    if (active) { refreshPageFitZoom(); return; }
    const back = pdfReturnMode;
    pdfReturnMode = null;
    if (back === 'edit' && currentMode === 'read') switchMode('edit');
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
    // Annuler ou Rétablir peut rendre une composition où plusieurs œils changent à la fois : aucun nom à dire.
    if (name == null) return;
    setStatus(I18n.t(hidden ? 'status.macroModelHidden' : 'status.macroModelShown', { name }));
  }

  // Ouvrir un modèle d'un macro-modèle, et y revenir
  // Le stylo d'une ligne du résumé d'un macro-modèle (js/macro-editor.js:showSummary) ouvre ce modèle dans l'éditeur comme un choix de la liste ;
  // tant qu'il est à l'écran, le bandeau « Revenir au macro-modèle » (#macro-return-bar) ramène au macro-modèle d'origine. macroOrigin = { macroId,
  // templateId } est remis à null dès qu'un autre modèle se charge (liste, « + », galerie, suppression : forgetMacroOriginUnless, en tête de
  // loadTemplateIntoEditor), jamais quand le même est rechargé (conflit d'enregistrement automatique).

  // Un bandeau « Revenir à… » (macro-modèle ou document) : montré tant que le modèle d'origine existe, avec son nom dans la phrase. Le nom d'un modèle long est coupé par « … » : la phrase se lit en
  // entier au survol.
  function showReturnBar(bar, textId, textKey, origin) {
    bar.hidden = !origin;
    const text = document.getElementById(textId);
    if (!text) return;
    text.textContent = origin ? I18n.t(textKey, { name: origin.nom }) : '';
    text.title = text.textContent;
  }

  function syncMacroReturnBar() {
    if (!macroReturnBar) return;
    showReturnBar(macroReturnBar, 'macro-return-text', 'macro.return.text', macroOrigin && Templates.byId(macroOrigin.macroId));
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
    showReturnBar(linkedReturnBar, 'linked-return-text', 'linkedTable.return.text', linkedOrigin && Templates.byId(linkedOrigin.templateId));
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
    const epoch = persist.autosaveEpoch;
    try { await refreshTemplateList(); } catch (e) { console.warn('[main] relecture des modèles impossible', e); }
    // Un autre modèle s'est chargé pendant la relecture (un choix dans la liste) : celui-là gagne.
    if (epoch !== persist.autosaveEpoch) return;
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
  // Annuler et Rétablir, que la lecture d'un PDF garde actifs (applyFormattingBarLock).
  const PDF_HISTORY_IDS = ['v2-btn-undo', 'v2-btn-redo'];
  const READ_ONLY_DISABLED_INPUTS = ['settings-margin-top', 'settings-margin-right', 'settings-margin-bottom', 'settings-margin-left',
    'settings-margin-preset-none', 'settings-margin-preset-narrow', 'settings-margin-preset-classic', 'settings-margin-preset-wide', 'settings-margins-link'];
  // Réglage présent au démarrage : les droits sont attendus avant le premier affichage, au plus ce délai (Grist qui tarde à répondre) - au-delà le
  // widget démarre verrouillé (AccessRights.get() tant que le calcul n'a pas abouti) et se déverrouille seul à la réponse.
  const ACCESS_STARTUP_WAIT_MS = 5000;
  // Délai après l'ouverture au bout duquel les colonnes exactes des tables sont relues si rien ne l'a fait (l'affichage du premier modèle les demande
  // déjà, Editor.setHTML).
  const EXACT_SCHEMA_CHECK_MS = 2500;

  function isReadOnly() { return AccessRights.get().readOnly; }

  // `reason` : la clé de la phrase qui dit pourquoi (js/i18n.js, « lock.* »), l'info-bulle du contrôle et ce que son clic écrit dans le coin d'état (js/lock-reasons.js, cause « access »).
  function setAccessLocked(el, locked, reason) {
    if (!el) return;
    el.classList.toggle(ACCESS_LOCK_CLASS, locked);
    if (locked) el.setAttribute('aria-disabled', 'true');
    else el.removeAttribute('aria-disabled');
    LockReasons.set(el, 'access', locked && reason ? I18n.t(reason) : '');
  }

  // Pendant la lecture d'un PDF (js/pdf-reading.js, consigne GFS 040), ce qui ne s'applique pas à lui reste là, GRISÉ avec sa raison - dans l'info-bulle du survol (`title`, comme setExplained de js/main-toolbar.js :
  // l'info-bulle de l'app, qu'un grisé estomperait avec le bouton, est cachée en CSS) et, au clic, dans le coin d'état -, jamais caché : l'édition, ce qui change ou range un modèle (enregistrer, renommer, supprimer, la
  // page), l'export et les commentaires. « Nouveau » et l'arbre des modèles restent actifs : ouvrir un modèle ferme le PDF (loadTemplateIntoEditor). Un compte en lecture seule garde en plus son propre grisé
  // (ACCESS_LOCK_CLASS), qui ne s'efface pas avec celui-ci. Les règles de la feuille de style : extensions/lecture-pdf/pdf-view.css.
  const PDF_LOCK_CLASS = 'pp-pdf-locked';
  const PDF_LOCKS = [
    { reason: 'edit', ids: ['btn-mode-edit'] },
    { reason: 'template', ids: ['v2-save-group', 'btn-delete', 'btn-link-rules', 'btn-rename-template', 'btn-set-default-template', 'v2-pdf-filename-cluster', 'v2-page-group'] },
    { reason: 'export', ids: EXPORT_LOCKED_IDS },
    { reason: 'comment', ids: ['v2-btn-comment'] },
  ];
  function applyPdfLocks() {
    const on = PdfReading.isActive();
    const reasons = on ? PdfReading.reasons() : null;
    PDF_LOCKS.forEach(({ reason, ids }) => ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const wasOn = el.classList.contains(PDF_LOCK_CLASS);
      // Sans raison, pas de grisé : « Commenter » se dégrise pour un PDF qui a du texte (js/pdf-reading.js:reasons).
      const locked = on && !!reasons[reason];
      el.classList.toggle(PDF_LOCK_CLASS, locked);
      // La raison est l'info-bulle du contrôle et ce que son clic écrit dans le coin d'état : js/lock-reasons.js (cause « pdf »), qui rend aussi au dégrisé le `title` d'avant.
      LockReasons.set(el, 'pdf', locked ? reasons[reason] : '');
      if (locked) {
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('data-pp-pdf-reason', reasons[reason]);
      } else if (wasOn) {
        el.removeAttribute('data-pp-pdf-reason');
        if (!el.classList.contains(ACCESS_LOCK_CLASS)) el.removeAttribute('aria-disabled');
      }
    }));
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
    // Pourquoi, dans l'ordre : un document en lecture seule, le mode lecture, la carte de l'accès. Les séparateurs se grisent avec la barre mais ne disent rien : on ne les clique pas.
    const reason = isReadOnly() ? 'lock.readOnly' : currentMode === 'read' ? 'lock.readMode' : 'lock.accessGuide';
    // Un PDF à l'écran se commente (extensions/lecture-pdf/pdf-comments.js) et ses commentaires se défont par l'historique de l'éditeur caché (js/action-history.js) : Annuler et Rétablir suivent alors le droit de commenter,
    // comme Commenter (et disent la même raison), au lieu du grisé de la Lecture.
    const followComments = PdfReading.isActive() && !isAccessGuideShown();
    Array.from(formattingBar.children).forEach((child) => {
      if (child.id === 'v2-btn-comment') return;
      const follows = followComments && PDF_HISTORY_IDS.indexOf(child.id) !== -1;
      setAccessLocked(child, follows ? !AccessRights.get().canComment : locked, child.classList.contains('v2-sep') ? '' : (follows ? 'lock.noComment' : reason));
    });
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
    READ_ONLY_LOCKED_IDS.forEach(id => setAccessLocked(document.getElementById(id), rights.readOnly, 'lock.readOnly'));
    applyFormattingBarLock();
    setAccessLocked(document.getElementById('v2-btn-comment'), !rights.canComment, 'lock.noComment');
    EXPORT_LOCKED_IDS.forEach(id => setAccessLocked(document.getElementById(id), !rights.canExport, 'lock.noExport'));
    // Les marges de Réglages : grisées en lecture seule, avec leur raison en info-bulle (cause « state » : un champ `disabled` ne reçoit pas le clic).
    READ_ONLY_DISABLED_INPUTS.forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      input.disabled = rights.readOnly;
      LockReasons.set(input, 'state', rights.readOnly ? I18n.t('lock.readOnly') : '');
    });
    applyCommentsPermissions();
    applyPdfLocks();
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
  // capture, avant tout gestionnaire. Et sur tout contrôle grisé qui dit pourquoi (js/lock-reasons.js : les droits, la lecture d'un PDF, le type du modèle,
  // une grille...) : le clic ne fait rien et le coin d'état en dit la raison, comme l'info-bulle du survol. Les deux gardes se complètent : le premier
  // arrête aussi ce qui n'a pas de raison.
  function wireAccessLockGuard() {
    document.addEventListener('click', event => {
      const target = event.target;
      if (!target || !target.closest || !target.closest('.' + ACCESS_LOCK_CLASS)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const reason = LockReasons.reasonOf(target.closest('.' + ACCESS_LOCK_CLASS));
      if (reason) setStatus(reason);
    }, true);
    LockReasons.wire(setStatus);
  }

  // L'état de l'enregistrement - manuel (saveRunning, saveStartedAt, saveWaiting), automatique (autosave...) - et de la sortie d'un modèle (leavePrompt..., restoringVersion), en UN objet : les gestes
  // qui s'en partagent les variables (js/main-autosave.js, js/main-save.js, js/main-leave.js) le reçoivent de main.js, qui le lit aussi.
  const persist = {
    saveRunning: null, // la promesse de l'enregistrement en cours
    saveStartedAt: 0,
    saveWaiting: null, // celle du geste qui attend sa fin : un seul, quel que soit le nombre de clics
    autosaveDirty: false,
    // Ce qui est « à enregistrer » comprend un RÉGLAGE de cette personne (nom, e-mail, marges...), pas seulement du texte. Pendant l'écriture en direct, c'est ce qui fait écrire aussi une personne autre
    // que celle qui enregistre le modèle pour tout le monde (autosaveTickBlocked, js/live-entry.js).
    autosaveSettingsDirty: false,
    // La date d'un enregistrement venu d'ailleurs, déjà attendue une fois : celui qui l'a fait, s'il écrit en direct, l'annonce dans la seconde (runAutosaveTick).
    conflictDeferredFor: null,
    autosaveLastKnownDateModif: null,
    // Dernière fois que le modèle ouvert a été comparé à Grist (performance.now : l'horloge du système peut reculer) : un passage qui a lu, ou le
    // chargement du modèle, qui vient de Grist.
    autosaveLastCheckAt: -Infinity,
    autosaveConflictActive: false,
    autosaveConflictTpl: null,
    autosaveTimer: null,
    // La question « Enregistrer / Abandonner / Annuler » est posée (askBeforeLeaving) : l'enregistrement automatique n'écrit rien pendant ce temps,
    // sinon « Abandonner » ne laisserait rien à abandonner - ce que la personne a tapé serait déjà enregistré. `leavePromptCount` : les demandes en route
    // (la question attend d'abord le passage en cours) ; le drapeau ne retombe qu'avec la dernière.
    leavePromptOpen: false,
    leavePromptCount: 0,
    // Une restauration de version est en cours (restoreVersionOnScreen) : l'enregistrement automatique ne part pas, il écrirait l'ancien écran par-dessus la version restaurée.
    restoringVersion: false,
    // Numéro de la dernière modification (frappe ou réglage, cf. markAutosaveDirty). Un drapeau « à enregistrer » remis à zéro au retour de l'écriture
    // effacerait aussi ce qui a été tapé pendant qu'elle durait (des secondes quand Grist est lent) : ces mots ne seraient pas enregistrés tant qu'une
    // autre frappe ne rallumerait pas le drapeau, alors que « Enregistré à… » s'afficherait. noteSaved(numéro) ne rend « enregistré » que ce qui n'a
    // pas bougé depuis le numéro que l'écriture portait au départ.
    autosaveEditVersion: 0,
    // Monte à chaque chargement d'un modèle (resetAutosaveState). Un passage ou un enregistrement qui attend Grist le relit à son retour : s'il a
    // changé, le modèle de l'écran n'est plus celui sur lequel il a commencé, et ni la date lue ni l'état « enregistré » qu'il s'apprête à poser ne lui
    // appartiennent plus.
    autosaveEpoch: 0,
    // Grist a refusé d'écrire dans le modèle de l'écran (une règle d'accès : la personne le lit sans pouvoir le modifier, par exemple un fichier que GFS lui partage en lecture, consigne 060 de GFS) : le numéro de modèle
    // (autosaveEpoch) du refus. L'enregistrement automatique n'écrit plus pour ce modèle, il redemanderait la même écriture toutes les 2,5 s, et ne relit la table qu'au rythme du repos ; un Enregistrer à la main
    // redemande, et un Enregistrer réussi ou un autre modèle chargé lève l'arrêt.
    autosaveRefusedEpoch: -1,
    // Un passage de l'auto-save est en cours (autosaveTick) : celui de l'intervalle suivant ne s'empile pas derrière - sauf s'il dure depuis plus d'une
    // minute (un appel à Grist qui ne revient jamais ne doit pas arrêter l'enregistrement automatique pour de bon).
    autosaveTickPending: false,
    autosaveTickStartedAt: 0,
  };

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
  // de chaque diapositive (transition, fond, notes de l'intervenant), que seul le PowerPoint reprend ; { anchors } (la Lecture) laisse à une diapositive que vise un lien son bloc d'adresse.
  async function currentDocumentHtml(tableId, record, options) {
    if (currentTypeModele !== 'macro') return SlidesEntry.outputHtml(currentTypeModele, Editor.getHTML(), Object.assign({ theme: PageLayout.getTheme() }, options));
    if (!record || !tableId) return '';
    return MacroTemplates.buildConcatenatedHtml(getCurrentMacroSlots(), tableId, record, LinkedTable.resolveTemplates(EditorCore.getEditor(), Templates.getCached()), Object.assign(perModelOption(), { anchors: !!(options && options.anchors) }));
  }

  // « Selon chaque modèle » (PageLayout.isOrientationAuto) : le macro-modèle chargé laisse chaque modèle assemblé garder le sens de sa page. L'assemblage (MacroTemplates) le dit dans
  // le HTML, d'où la Lecture, le PDF, le Word et l'impression tournent leurs pages ; un sens imposé n'ajoute rien.
  function perModelOption(perModel = PageLayout.isOrientationAuto()) { return { perModel }; }

  async function renderReader(record, recordTableId) {
    // Un PDF à l'écran (js/pdf-reading.js) : la Lecture montre le PDF, que la ligne de la table change ou non ; il se pose une fois, et seul un modèle qui s'ouvre le remplace.
    if (PdfReading.isActive()) { await PdfReading.render(readerContainer); return; }
    if (typeof record === 'undefined') record = latestRecord || GristAPI.getCurrentRecord();
    let tableId = recordTableId || GristAPI.getCurrentTableId() || currentTableId;
    // Sans ligne sélectionnée, ReaderMode.render() affiche tout de même son état vide : un simple `return` laisserait #reader-container vide, un
    // écran blanc sans explication. onCreateEmail (mode email) appelle aussi renderReader() alors que currentMode reste 'edit', pour lire le corps
    // résolu sans changer de mode : #reader-container reste display:none tant que currentMode !== 'read' (cf. switchMode).
    if (!record) { await ReaderMode.render(await currentDocumentHtml(tableId, null, { anchors: true }), tableId, null, Editor.getHeaderFooterData()); return; }
    if (!tableId) {
      const ctx = await GristAPI.detectCurrentContext();
      if (ctx && ctx.tableId) { currentTableId = ctx.tableId; tableId = ctx.tableId; }
    }
    readerContainer.classList.toggle('pp-reader-comments', readerCommentsActive());
    // Le HTML est donné par une fonction : l'assemblage d'un macro-modèle (ses règles de slot) relit des tables, ce qui doit se faire dans les
    // lectures partagées de ce rendu.
    const html = async () => (readerCommentsActive() ? SlidesEntry.outputHtml(currentTypeModele, await Comments.buildReaderHtml(), { anchors: true, theme: PageLayout.getTheme() }) : currentDocumentHtml(tableId, record, { anchors: true }));
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
    if (!id || currentTypeModele === 'macro' || persist.autosaveConflictActive) return false;
    const nom = templateNameInput ? templateNameInput.value.trim() : '';
    if (!nom) return false;
    const epoch = persist.autosaveEpoch;
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
      const editVersion = persist.autosaveEditVersion;
      const token = LiveEntry.saveToken(); // l'état du texte juste avant qu'il soit lu (écriture en direct)
      const { dateModif } = await saveScreenAs(id, nom, suiviModifications);
      LiveEntry.published(token, dateModif);
      if (epoch === persist.autosaveEpoch) {
        persist.autosaveLastKnownDateModif = dateModif;
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

  // Les exports (le verrou, l'export d'une ligne, les menus d'export, les exports en lot) sont dans js/main-export.js ; ce qu'il tire d'ici lui est donné, le type du modèle et la table à l'écran en lecture.
  const { isExportRunning, onCreateEmail, onExport, onExportBatch, onExportDocx, onExportPdf, onExportXlsx, syncExportMenus, syncExportRowsForModelType, withExportLock } = MainExport.create({
    buildMailtoForRecord, currentDocumentHtml, getCurrentMacroSlots, getPdfFilenameTemplate, perModelOption, setStatus, templateNameInput,
    getCurrentTableId: () => currentTableId, getCurrentTypeModele: () => currentTypeModele,
  });

  // L'enregistrement automatique (js/main-autosave.js), l'enregistrement manuel avec les versions, la suppression et la copie d'un modèle (js/main-save.js) et la sortie d'un modèle
  // (js/main-leave.js) : leur état partagé est `persist` ci-dessus ; créés ici, dans cet ordre (le deuxième tire du premier, le troisième des deux), après les exports (isExportRunning).
  const {
    AUTOSAVE_ENABLED_STORAGE, AUTOSAVE_TICK_WATCHDOG_MS, changedElsewhere, hideConflictBanner, isAutosaveEnabled, linkedSendFor, markAutosaveDirty,
    markTextDirty, noteKnownState, noteSaved, readRemoteTemplate, resetAutosaveState, saveScreenAs, setAutosaveEnabled, showConflictBanner, startAutosaveLoop,
    syncSaveButtonLook, updateSaveStatus, whenAutosaveTickDone, wireAutosaveConflictBanner,
  } = MainAutosave.create({
    adoptTableName, conflictBanner, conflictReloadBtn, followLinkedModels, getCurrentTypeModele: () => currentTypeModele, getEmailFieldsFromInputs,
    getPdfFilenameTemplate, getTitleNameBase: () => titleNameBase, isExportRunning, isReadOnly, loadTemplateIntoEditor, persist, refreshTemplateList, setStatus,
    setTitleNameBase: value => { titleNameBase = value; }, statusMsg, templateNameInput,
  });
  const { SAVE_WATCHDOG_MS, onDelete, onSave, saveAsNewTemplate, saveIsRunning, whenSaveFinished, wireSaveMenu } = MainSave.create({
    AUTOSAVE_ENABLED_STORAGE, followLinkedModels, forgetLinkedOriginUnless, forgetMacroOriginUnless, getCurrentTypeModele: () => currentTypeModele,
    hideConflictBanner, isAutosaveEnabled, isReadOnly, linkedSendFor, loadTemplateIntoEditor, macroSettingsOnScreen, noteKnownState, noteSaved, onMacroSaved,
    persist, refreshTemplateList, saveScreenAs, setAutosaveEnabled, setStatus, settleTemplateName, showTemplateList, startBlankDocument,
    syncDefaultTemplateButton, syncSaveButtonLook, templateNameInput, templateSelect, updateSaveStatus, whenAutosaveTickDone,
  });
  const { askBeforeLeaving, hasEditsToConfirmBeforeLeaving, leaveForGfs, saveBeforeGfsLeaves } = MainLeave.create({
    AUTOSAVE_TICK_WATCHDOG_MS, getCurrentTypeModele: () => currentTypeModele, isAutosaveEnabled, isReadOnly, onSave, persist, refocusEditorIfLost,
    saveIsRunning, templateNameInput, whenAutosaveTickDone, whenSaveFinished,
  });

  // L'import d'un fichier (Excel, Markdown, PowerPoint, Word : le menu « + » et le « Nouveau > Importer » de GFS) est dans js/main-import.js ; ce qu'il tire d'ici lui est donné.
  const { importFileFromGfs, onImportDocx, onImportMd, onImportPptx, onImportXlsx } = MainImport.create({ askBeforeLeaving, hasEditsToConfirmBeforeLeaving, isReadOnly, loadTemplateIntoEditor, markAutosaveDirty, refocusEditorIfLost, setStatus, templateSelect, updateSaveStatus });

  async function switchMode(mode) {
    // Lecture seule : le mode Lecture est le seul accessible, y compris depuis la dernière ligne d'init().
    if (isReadOnly()) mode = 'read';
    // Un PDF à l'écran (js/pdf-reading.js) ne s'édite pas : le mode Lecture est le seul accessible, le bouton Édition est grisé avec sa raison (applyPdfLocks).
    if (PdfReading.isActive()) mode = 'read';
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
    // Le facteur d'ajustement de la page se pose avant le rendu quand la Lecture n'en a pas encore : le conteneur vient d'être affiché, et c'est le moment où l'observateur de taille
    // (wirePageFitZoom) le trouverait changé et redessinerait la Lecture une seconde fois, en plein rendu - la première entrée la dessinait deux fois. Une Lecture qui en a un déjà (une
    // entrée suivante) le garde : le recalculer ici ferait mettre en page l'ancien contenu, qui est sur le point d'être remplacé.
    if (mode === 'read' && !readerContainer.style.getPropertyValue('--pp-fit-zoom')) applyPageFitZoom(readerContainer);
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
    readerContainer.classList.toggle('a4-preview', on || PdfReading.isActive());
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
  // grisée ne choisit rien. Le menu du bouton Exporter se câble de même : un clic (ou Entrée, Espace) sur une option de lignes la coche, rien ne s'exporte ; la destination du PDF
  // (le télécharger, le ranger dans GFS ou les deux : js/pdf-delivery.js) s'y coche de la même façon.
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
    // Chaque choix est un pas d'Annuler / Rétablir (js/history-markers.js, domaine « exportChoices ») ; rien n'est posé si le choix ne change rien.
    const choose = (select, value) => HistoryMarkers.track('exportChoices', () => { select.value = value; syncExportMenus(); ExportChoices.remember(select.id, value); });
    const onRow = (row, select, value) => row.addEventListener('click', () => { if (!row.classList.contains('v2-hover-row-disabled')) choose(select, value); });
    flyout.querySelectorAll('.v2-hover-row[data-export-type]').forEach(row => onRow(row, typeSelect, row.dataset.exportType));
    flyout.querySelectorAll('.v2-hover-row[data-quality]').forEach(row => onRow(row, qualitySelect, row.dataset.quality));
    // La destination du PDF est un réglage de la personne (PersonStore), pas du modèle : son pas d'Annuler est celui de SettingsHistory, et le rangement dit au coin d'état où il en est.
    PdfDelivery.wire(exportFlyout, syncExportMenus);
    PdfDelivery.onProgress((current, total) => setStatus(I18n.t(total > 1 ? 'shelve.progress' : 'shelve.progressOne', { current, total })));
    // La case « Joindre à la ligne » est un réglage de la personne aussi (js/row-attachment.js) ; la jointure dit où elle en est au coin d'état.
    RowAttachment.wire(exportFlyout, syncExportMenus, setStatus);
    PdfDelivery.onAttachProgress((current, total) => setStatus(I18n.t(total > 1 ? 'attach.progress' : 'attach.progressOne', { current, total })));
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
  // Deux temps, comme tout ce qui lit la mise en page puis la change : `planPageFitZoom` LIT (le facteur, et l'écart de hauteur des lignes de tableau que mesure la sonde de js/page-zoom.js),
  // `commitPageFitZoom` ÉCRIT. Posé d'abord, le facteur obligeait la sonde à faire refaire le style de tout le document pour le lire (0,2 s sur une présentation de 39 diapositives), puis la
  // variable de l'écart (`--pp-row-grow`) le faisait refaire une seconde fois ; et le conteneur suivant, lu après l'écriture du premier, payait encore ce que celui-là venait de défaire.
  // La sonde est posée dans `body` : son résultat ne dépend que du facteur, jamais de l'état du document, qu'elle lise avant ou après.
  function planPageFitZoom(container) {
    if (!container) return null;
    if (!container.classList.contains('a4-preview')) return { container, reset: true };
    const zoom = PageZoom.factorFor(container);
    if (zoom == null) return null;
    // Arrondi au millième : sans ça, un redimensionnement continu réécrit la variable à chaque pixel et relance la pagination en boucle.
    const next = String(Math.round(zoom * 1000) / 1000);
    // L'écart de hauteur des lignes de tableau sous ce facteur (js/page-zoom.js:rowGrow) suit le facteur, et la densité de pixels de l'écran, qui peut changer seule : mesuré ici, gardé en mémoire
    // pour `syncRowGrow` de l'écriture.
    if (Number(next) > 0 && Number(next) !== 1) PageZoom.rowGrow(Number(next));
    return { container, next };
  }
  function commitPageFitZoom(plan) {
    if (!plan) return undefined;
    const { container } = plan;
    if (plan.reset) { container.style.removeProperty('--pp-fit-zoom'); PageZoom.syncRowGrow(container, 0); return undefined; }
    const changed = container.style.getPropertyValue('--pp-fit-zoom') !== plan.next;
    if (changed) container.style.setProperty('--pp-fit-zoom', plan.next);
    return PageZoom.syncRowGrow(container, Number(plan.next)) || changed || undefined;
  }
  // Un seul conteneur (l'entrée en Lecture) : lit, puis écrit. Rend true quand le facteur ou l'écart de lignes a changé.
  function applyPageFitZoom(container) {
    return commitPageFitZoom(planPageFitZoom(container));
  }
  // Les deux conteneurs d'un coup : tout se lit, puis tout s'écrit, dans l'ordre donné. Rend, dans le même ordre, ce que chaque écriture dit (true quand le conteneur a changé).
  function applyPageFitZoomTo(first, second) {
    const plans = [planPageFitZoom(first), planPageFitZoom(second)];
    return [commitPageFitZoom(plans[0]), commitPageFitZoom(plans[1])];
  }

  // Pose le facteur sur les deux conteneurs sans rien rafraîchir, pour les appelants qui rafraîchissent eux-mêmes juste après (chargement d'un
  // modèle, changement d'orientation). Rend true si l'un des deux a changé.
  function applyPageFitZoomToBoth() {
    const [editorChanged, readerChanged] = applyPageFitZoomTo(editorContainer, readerContainer);
    return !!(editorChanged || readerChanged);
  }

  function refreshPageFitZoom() {
    const [editorChanged, readerChanged] = applyPageFitZoomTo(editorContainer, readerContainer);
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
      // `saveCreated` enregistre l'écran comme un modèle neuf et le range dans l'historique d'Annuler / Rétablir (saveAsNewTemplate) ; `currentTemplateId`, le modèle que l'écran montre avant que le nouveau le remplace.
      loadTemplateIntoEditor, saveCreated: saveAsNewTemplate, currentTemplateId: () => Templates.getCurrentId(), setStatus, hasEditsToConfirmBeforeLeaving, askBeforeLeaving, savedTemplateName,
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
    // Annuler ou Rétablir rend une valeur à un champ (js/field-editor.js, domaine « fields ») : le crayon du nom du PDF et le bouton « + Cci » en montrent l'état, comme au chargement d'un modèle.
    if (pdfFilenameInput) pdfFilenameInput.addEventListener('fieldrestored', () => { pdfFilenameInput.hidden = !pdfFilenameInput.value.trim(); });
    if (emailCciInput) {
      emailCciInput.addEventListener('fieldrestored', () => {
        emailCciInput.hidden = !emailCciInput.value.trim();
        if (emailCciToggle) emailCciToggle.classList.toggle('is-active', !emailCciInput.hidden);
      });
    }
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
    // En écriture en direct, la page est celle du groupe (extensions/edition/live-page.js) : changée ici, ou reçue d'une autre personne (`detail.remote`, rien à marquer, le modèle est déjà « à enregistrer »),
    // elle n'est pas un réglage de cette personne. Le modèle est seulement « à enregistrer » et c'est la personne qui enregistre qui l'écrit, avec le texte : une personne qui n'enregistre pas ne réécrit
    // jamais la page à sa place (une page restée en retard écraserait celle du groupe).
    document.addEventListener('pp:marginsChanged', (event) => {
      if (event.detail && event.detail.remote) return;
      if (LiveEntry.isLive()) markTextDirty(); else markAutosaveDirty();
    });
    // Émis par PageLayout.setOrientation (bouton Portrait / Paysage) : la feuille change de largeur et de hauteur. Le bouton ne rafraîchit rien
    // lui-même.
    document.addEventListener('pp:pageLayoutChanged', onPageLayoutChanged);
    // Émis par PageLayout.setWatermark (fenêtre « Filigrane… ») : la couche des pages est repeinte, la page ne change pas de forme.
    document.addEventListener('pp:watermarkChanged', onWatermarkChanged);
    // Émis par MailtoExport.setMailClient (Réglages > Email) : le lien de l'email, donc sa longueur, change avec la messagerie choisie.
    document.addEventListener('pp:mailClientChanged', scheduleEmailLengthGauge);
  }

  // La date `a` d'un modèle est-elle antérieure à `b` ? (secondes de Grist, ou leur écriture ISO quand la relecture a échoué ; une date illisible n'est antérieure à rien)
  function dateModifBefore(a, b) {
    const seconds = value => (typeof value === 'number' ? value : Date.parse(value) / 1000);
    const x = seconds(a), y = seconds(b);
    return Number.isFinite(x) && Number.isFinite(y) && x < y && !Templates.sameDateModif(a, b);
  }
  // L'écriture en direct (extension « édition », js/live-entry.js) : ce que le socle lui dit du modèle ouvert, ce qu'elle peut lui demander, et l'enregistrement d'une autre personne du direct.
  // Sa date est celle que ce widget connaît maintenant (le passage suivant n'y voit pas un conflit) et, si le texte d'ici est dans l'état qu'elle a enregistré, rien n'est plus « à enregistrer ».
  function adoptLiveSave({ modified, atState }) {
    if (!LiveEntry.isLive()) return;
    // Jamais en arrière : le dernier enregistrement que le salon garde peut être plus ancien que le modèle ouvert ici (enregistré depuis, hors du direct) ; sa date ferait voir un conflit qui n'en est pas un.
    if (dateModifBefore(modified, persist.autosaveLastKnownDateModif)) return;
    persist.autosaveLastKnownDateModif = modified;
    // Une page ouverte hors du direct pendant que le groupe enregistrait montre le bandeau « modifié ailleurs » d'un enregistrement du groupe ; en rejoignant, elle prend le texte du groupe, qui est
    // celui de cet enregistrement ou d'un plus récent : le conflit est réglé. Un enregistrement fait depuis hors du direct (plus récent que celui du groupe) garde le bandeau.
    if (persist.autosaveConflictActive && persist.autosaveConflictTpl && !dateModifBefore(modified, persist.autosaveConflictTpl.dateModif)) hideConflictBanner();
    if (atState && !persist.autosaveSettingsDirty) persist.autosaveDirty = false;
    updateSaveStatus();
  }
  // Le texte affiché peut-il être remplacé par celui d'un direct déjà en cours (l'entrée automatique, js/live-entry.js) sans que la personne s'y attende ? Pas quand l'écran est à autre chose qu'à ce
  // texte : la Lecture, la carte de l'accès, une question de départ, une restauration de version, un export, un conflit à trancher, l'en-tête ou le pied en édition.
  function textMayBeReplaced() {
    return currentMode === 'edit' && !isAccessGuideShown() && !persist.leavePromptOpen && !persist.restoringVersion && !isExportRunning() && !persist.autosaveConflictActive && !Editor.isEditingHeaderFooter();
  }
  function wireLiveEditing() {
    LiveEntry.setContext(() => ({ id: Templates.getCurrentId(), type: currentTypeModele, readOnly: isReadOnly(), dirty: persist.autosaveDirty, modified: persist.autosaveLastKnownDateModif, idle: textMayBeReplaced() }));
    LiveEntry.setHooks({ markUnsaved: markTextDirty });
    LiveEntry.onSaved(adoptLiveSave);
  }

  // L'ajustement de la page se refait tout de suite ; la pagination de l'éditeur une seule fois, en fin de tâche, et pas du tout si une autre a eu lieu entre-temps : l'ouverture d'un
  // modèle montre la bande puis pagine elle-même, et une pagination coûte sur une présentation chargée (70 diapositives d'images : 0,3 s, mesure du 21/10).
  let slidesRelayoutPending = false;
  function relayoutForSlides() {
    const [readerChanged] = applyPageFitZoomTo(readerContainer, editorContainer);
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
    const btnImportDocx = document.getElementById('v2-btn-import-docx');
    if (btnImportDocx) btnImportDocx.addEventListener('click', onImportDocx);
    const btnImportPptx = document.getElementById('v2-btn-import-pptx');
    if (btnImportPptx) btnImportPptx.addEventListener('click', onImportPptx);
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
    // Le bouton Mode lecture fait ce que dit la ligne cochée de son menu (js/clean-reading.js), comme Exporter : la Lecture (cochée au départ) ou la Lecture épurée.
    // `detail` à 0 : Entrée, Espace ou Alt+L (qui clique le bouton) - le focus revient au bouton à la sortie de la Lecture épurée.
    btnRead.addEventListener('click', event => CleanReading.readButton(event.detail === 0));
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
    RowAttachment.wirePanel();
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
    RowAttachment.init();
    SaveReminder.init();
    RowTemplate.init({
      // La ligne de la table qui change ne remplace pas le PDF que la personne lit.
      openTemplate: id => (PdfReading.isActive() ? Promise.resolve(false) : openTemplateForRow(id)),
      currentId: () => Templates.getCurrentId(),
      currentRecord: () => ({ record: latestRecord, tableId: latestRecordTableId }),
    });
    // GFS (js/gfs-open.js, consignes GFS 010, 014, 035 et 047) : le modèle qu'il désigne s'ouvre au démarrage, et son appel `ouvrir` passe par le chemin du sélecteur, comme la règle de ligne ; « Nouveau » ouvre un modèle vierge du type
    // demandé, par le chemin du bouton « Nouveau » de ce type ; « Nouveau > Importer » importe le fichier qu'il donne, par le chemin de la ligne d'import du menu « + ». Avant de quitter le modèle ouvert, ce qui attend est enregistré
    // sans question quand l'enregistrement automatique est allumé (saveBeforeGfsLeaves), et l'appel `fermer` y répond (leaveForGfs). Seul, rien n'arrive.
    GfsOpen.init({ openTemplate: openTemplateForRow, openBlank: openBlankOfType, importFile: importFileFromGfs, readPdf: PdfReading.open, say: text => setStatus(text), saveBeforeLeaving: saveBeforeGfsLeaves, leave: leaveForGfs });
    PdfReading.init({ leave: leaveForPdf, show: () => switchMode('read'), say: (text, isError) => setStatus(text, isError), layoutChanged: () => refreshPageFitZoom() });
    PdfReading.onChange(onPdfReadingChange);
    PdfReading.onLocksChanged(applyPdfLocks);
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
    ActionHistory.wire({ status: setStatus });
    FormatSlots.wire({ status: setStatus });
    HeadingStyles.wire({ status: setStatus });
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
    // Juste après « Widget prêt. » : la phrase qui dit pourquoi ce modèle s'est ouvert (GFS) la remplace ; les avertissements de checkAfterOpen passent après elle, et l'import que GFS demande (« Nouveau > Importer ») puis les appels `ouvrir` reçus pendant le démarrage sont traités à la fin de ce tour.
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
