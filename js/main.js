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

  // Les quatre champs de l'email : leur clé, la même dans les réglages du modèle et dans les valeurs résolues, et leur champ (un champ texte à bulles,
  // js/field-editor.js : l'élément se lit et s'écrit comme un <input>).
  const EMAIL_FIELDS = [['objet', emailSubjectInput], ['destinataires', emailToInput], ['cc', emailCcInput], ['cci', emailCciInput]];

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

  // Le modèle devient le modèle courant ; ses commentaires se chargent en arrière-plan.
  function setCurrentTemplate(tpl) {
    Templates.setCurrentId(tpl ? tpl.id : null);
    LiveEntry.changed(); // la ligne « Écriture en direct » du menu suit le modèle ouvert (js/live-entry.js)
    Comments.loadForTemplate(tpl ? tpl.id : null, tpl).catch(e => console.error('[main] chargement des commentaires impossible', e));
  }

  // Le nom que le titre tient de la table pour le modèle ouvert : celui qu'il y a lu à l'ouverture, ou que ce widget y a écrit depuis (saveScreenAs) ; null pour un modèle pas encore enregistré. La personne a changé
  // le nom ici quand le champ n'est plus celui-là. GFS renomme un fichier en n'écrivant que la colonne Nom de sa ligne (consigne GFS 029) : le nom d'un titre ouvert avant ne doit jamais repartir dans un lot.
  let titleNameBase = null;

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

  // La fenêtre des nouveautés s'ouvre toute seule, une fois par personne, à la première ouverture après une version qui en a (js/whats-new.js) : pour qui écrit, les droits confirmés (comme la Lecture épurée d'emblée, une
  // personne qui démarre verrouillée par précaution n'est pas une personne en lecture seule : une table des droits qui répond après le délai du démarrage lui ouvre la fenêtre à la réponse, sur la Lecture où le verrou l'a
  // mise) - ni sur la Lecture épurée, ni sur la carte de l'accès. Appelée à la fin d'init() puis à chaque changement de droits (jamais avant la fin du démarrage : le premier modèle n'est pas encore affiché) ;
  // WhatsNew s'en souvient : une seule ouverture par séance.
  let newsMayOpen = false;

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
    // Dernière modification du texte ou d'un réglage (performance.now) : un modèle lourd n'est pas enregistré pendant la frappe (js/main-autosave.js, heavyPassMustWait).
    autosaveLastEditAt: -Infinity,
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

  // Les droits par personne (js/main-access.js) : créés en premier, presque tous les autres morceaux prennent isReadOnly ; updateSaveStatus, rendu par l'autosave créé plus bas, lui est donné par un appel différé.
  const {
    ACCESS_STARTUP_WAIT_MS, EXACT_SCHEMA_CHECK_MS, applyAccessRights, applyCommentsPermissions, applyFormattingBarLock, applyPdfLocks, isReadOnly,
    onAccessRightsChange, onWidgetAccessChange, openCleanReadingForReadOnly, openNewsForEditors, wireAccessLockGuard,
  } = MainAccess.create({
    getCurrentMode: () => currentMode, getNewsMayOpen: () => newsMayOpen, isAccessGuideShown, setNewsMayOpen: value => { newsMayOpen = value; }, setStatus,
    switchMode, syncEditorVisibilityForMode, updateSaveStatus: (...args) => updateSaveStatus(...args),
  });

  // Le lecteur (js/main-reader.js) : créé en tête, l'e-mail, l'ajustement de la page et les diapositives lui prennent renderReader ; ce qu'il prend à l'autosave, créé plus bas, lui est donné par des appels différés.
  const { renderReader, saveReaderCommentAnchors } = MainReader.create({
    changedElsewhere: (...args) => changedElsewhere(...args), currentDocumentHtml, getCurrentTableId: () => currentTableId,
    getCurrentTypeModele: () => currentTypeModele, getLatestRecord: () => latestRecord, noteKnownState: (...args) => noteKnownState(...args),
    noteSaved: (...args) => noteSaved(...args), persist, readRemoteTemplate: (...args) => readRemoteTemplate(...args), readerContainer,
    saveScreenAs: (...args) => saveScreenAs(...args), setCurrentTableId: value => { currentTableId = value; },
    showConflictBanner: (...args) => showConflictBanner(...args), templateNameInput, updateSaveStatus: (...args) => updateSaveStatus(...args),
  });

  // Les champs e-mail et la jauge (js/main-email.js), l'ajustement de la page à la largeur (js/main-page-zoom.js), le renommage du modèle (js/main-rename.js) et l'ouverture d'un modèle depuis
  // un macro-modèle ou un tableau lié (js/main-macro-return.js) : créés ici, avant les exports, l'autosave et l'enregistrement qui leur prennent des noms (buildMailtoForRecord,
  // getEmailFieldsFromInputs, adoptTableName, settleTemplateName, forgetMacroOriginUnless...) ; ce qu'ils prennent aux morceaux créés plus bas (isAutosaveEnabled, markAutosaveDirty,
  // askBeforeLeaving, hasEditsToConfirmBeforeLeaving) leur est donné par des appels différés.
  const {
    buildMailtoForRecord, eachEmailInput, getEmailFieldsFromInputs, loadEmailFields, scheduleEmailLengthGauge, updateEmailFieldsDisplay, updateEmailLengthGauge,
    wireCciToggle,
  } = MainEmail.create({
    EMAIL_FIELDS, emailCciInput, emailCciToggle, emailCharCounter, emailFieldsRow, getCurrentMode: () => currentMode, getCurrentTableId: () => currentTableId,
    getCurrentTypeModele: () => currentTypeModele, getEmailFieldsRawCache: () => emailFieldsRawCache, getLatestRecord: () => latestRecord,
    getLatestRecordTableId: () => latestRecordTableId, readerContainer, renderReader, setEmailFieldsRawCache: value => { emailFieldsRawCache = value; },
  });
  const { applyPageFitZoom, applyPageFitZoomTo, applyPageFitZoomToBoth, refreshPageFitZoom, wirePageFitZoom } = MainPageZoom.create({
    editorContainer, getCurrentMode: () => currentMode, readerContainer, renderReader, templateNameInput,
  });
  const { adoptTableName, closeTemplateRenameEditor, savedTemplateName, settleTemplateName, showTemplateNames, wireTemplateRename } = MainRename.create({
    getTitleNameBase: () => titleNameBase, isAutosaveEnabled: (...args) => isAutosaveEnabled(...args),
    markAutosaveDirty: (...args) => markAutosaveDirty(...args), pdfFilenameInput, resetNewOptionText, setStatus,
    setTitleNameBase: value => { titleNameBase = value; }, templateNameInput, templateSelect,
  });
  const { forgetLinkedOriginUnless, forgetMacroOriginUnless, openLinkedModel, openTemplateFromMacro, wireLinkedReturn, wireMacroReturn } = MainMacroReturn.create({
    askBeforeLeaving: (...args) => askBeforeLeaving(...args), getCurrentMode: () => currentMode, getCurrentTypeModele: () => currentTypeModele,
    hasEditsToConfirmBeforeLeaving: (...args) => hasEditsToConfirmBeforeLeaving(...args), isReadOnly, linkedReturnBar, loadTemplateIntoEditor, macroReturnBar,
    onTemplateSelectChange, persist, refreshTemplateList, setStatus, templateSelect,
  });

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

  // L'écriture en direct et le suivi des modifications (js/main-live.js), les diapositives (js/main-slides.js) : créés après l'autosave, l'enregistrement et la sortie d'un modèle, dont ils prennent des noms.
  const { wireEditTracking, wireLiveEditing } = MainLive.create({
    eachEmailInput, emailCciInput, emailCciToggle, getCurrentMode: () => currentMode, getCurrentTypeModele: () => currentTypeModele, hideConflictBanner,
    isAccessGuideShown, isExportRunning, isReadOnly, markAutosaveDirty, markTextDirty, onPageLayoutChanged, onWatermarkChanged, pdfFilenameInput, persist,
    scheduleEmailLengthGauge, templateNameInput, updateSaveStatus, wireCciToggle,
  });
  const { wireSlides } = MainSlides.create({
    applyPageFitZoomTo, editorContainer, getCurrentMode: () => currentMode, getCurrentTypeModele: () => currentTypeModele, isReadOnly, readerContainer,
    renderReader, renderTemplateOptions, setStatus, startNewTemplate, templateSelect,
  });

  // L'import d'un fichier (Excel, Markdown, PowerPoint, Word : le menu « + » et le « Nouveau > Importer » de GFS) est dans js/main-import.js ; ce qu'il tire d'ici lui est donné.
  const { importFileFromGfs, onImportDocx, onImportMd, onImportPptx, onImportXlsx } = MainImport.create({ askBeforeLeaving, hasEditsToConfirmBeforeLeaving, isReadOnly, loadTemplateIntoEditor, markAutosaveDirty, onSave, refocusEditorIfLost, setStatus, templateNameInput, templateSelect, updateSaveStatus });

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
