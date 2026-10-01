// Orchestration : gestion de modèles + mode Édition/Lecture + export PDF + câblage Grist + modale "Tables liées". `Editor.init()` est async : il charge
// TipTap/ProseMirror via import() dynamique au moment de l'appel.
(function () {
  let currentMode = 'edit';
  let currentTableId = null;
  let latestRecord = null;
  let latestRecordTableId = null;
  // Mode email (planning/feature-email-mode.md) : 'document' par défaut, y compris pour un modèle jamais chargé (avant le tout premier appel à
  // loadTemplateIntoEditor) - ne devient 'email' que via un modèle dont TypeModele='email' ou onNewEmail().
  let currentTypeModele = 'document';
  // Valeurs BRUTES (gabarits #Variable) des 4 champs, capturées juste avant de passer en Lecture - le mode Lecture affiche des valeurs RÉSOLUES dans les
  // MÊMES <input> (pas de duplication de zone, comme le reste de la bar-row 2/#v2-toolbar déjà partagée entre les deux modes) ; non-null uniquement pendant
  // que le mode Lecture est actif, cf. updateEmailFieldsDisplay().
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
  const emailFieldsRow = document.getElementById('v2-email-fields-row');
  const emailSubjectInput = document.getElementById('v2-email-subject');
  const emailToInput = document.getElementById('v2-email-to');
  const emailCcInput = document.getElementById('v2-email-cc');
  const emailCciInput = document.getElementById('v2-email-cci');
  const emailCciToggle = document.getElementById('v2-btn-toggle-cci');
  const btnCreateEmail = document.getElementById('btn-create-email');
  const emailCharCounter = document.getElementById('v2-email-char-counter');

  // Résout Objet/À/Cc/Cci pour UNE ligne Grist donnée - partagé entre updateEmailFieldsDisplay (affichage Lecture), updateEmailLengthGauge (jauge §4.4) et
  // onCreateEmail (construction réelle du mailto:), pour ne jamais faire diverger ces 3 résolutions.
  async function resolveEmailFieldsForRecord(rawFields, tableId, record) {
    const [objet, destinataires, cc, cci] = await Promise.all([
      Variables.resolveTextVariables(rawFields.objet, tableId, record),
      Variables.resolveTextVariables(rawFields.destinataires, tableId, record),
      Variables.resolveTextVariables(rawFields.cc, tableId, record),
      Variables.resolveTextVariables(rawFields.cci, tableId, record),
    ]);
    return { objet, destinataires, cc, cci };
  }

  function getEmailFieldsFromInputs() {
    // En Lecture, les <input> affichent des valeurs RÉSOLUES (cf. updateEmailFieldsDisplay) - jamais ce qu'il faut enregistrer (onSave via Ctrl+S,
    // autosaveTick, qui ne vérifient pas currentMode). Le cache tient déjà les gabarits bruts dans cette même forme tant qu'il est non-null.
    if (emailFieldsRawCache) return emailFieldsRawCache;
    return {
      objet: emailSubjectInput ? emailSubjectInput.value.trim() : '',
      destinataires: emailToInput ? emailToInput.value.trim() : '',
      cc: emailCcInput ? emailCcInput.value.trim() : '',
      cci: emailCciInput ? emailCciInput.value.trim() : '',
    };
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

  // Réglages du macro-modèle chargé que sa fenêtre de composition ne montre pas, tels qu'ils sont à l'écran : nom du fichier PDF, en-tête et pied de page, page (marges, sens, format).
  // La fenêtre (js/macro-editor.js) et « Enregistrer sous » les réécrivent avec la composition ; remis à zéro, ils perdaient en silence ce que la personne avait réglé.
  function macroSettingsOnScreen() {
    return { nomFichierPDF: getPdfFilenameTemplate(), headerFooter: Editor.getHeaderFooterData(), marginsMm: PageLayout.getMarginsMm() };
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
    // Un modèle email ne doit jamais devenir le modèle qui s'ouvre par défaut (Antoine, 2026-09-19) :
    // l'email est une action ponctuelle sur un enregistrement, pas un état dans lequel le widget doit
    // démarrer. Grisé (disabled, même traitement visuel que "aucun modèle chargé"), jamais masqué. Même
    // raison pour un macro-modèle (planning/feature-macro-modeles.md) : l'UI de base doit rester propre au
    // démarrage, un mode spécialisé (email, macro) ne s'affiche que si l'utilisateur le demande sur le
    // moment - un widget qui s'ouvrirait sur le panneau résumé macro serait le même désagrément.
    btn.disabled = currentId == null || currentTypeModele === 'email' || currentTypeModele === 'macro';
  }

  function wireDefaultTemplateButton() {
    const btn = document.getElementById('btn-set-default-template');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const currentId = Templates.getCurrentId();
      if (!currentId || isReadOnly()) return;
      const wasDefault = String(Templates.getDefaultId()) === String(currentId);
      await Templates.setDefault(wasDefault ? null : currentId);
      await refreshTemplateList();
      templateSelect.value = currentId;
      syncDefaultTemplateButton();
      setStatus(wasDefault ? I18n.t('status.defaultTemplateCleared') : I18n.t('status.defaultTemplateSet'));
    });
    syncDefaultTemplateButton();
  }

  // Un macro-modèle (TypeModele='macro') n'a pas de contenu TipTap propre : Contenu est du JSON de composition (planning/feature-macro-modeles.md), jamais
  // du HTML - Editor.setHTML() ne doit donc JAMAIS le recevoir. Branche à part, plus courte que le chemin normal (pas de champs email, pas d'autosave
  // significatif puisque l'éditeur partagé n'est jamais touché pour ce type) plutôt que de parsemer loadTemplateIntoEditor de conditions supplémentaires.
  function loadMacroIntoEditor(tpl) {
    closeTemplateRenameEditor();
    Editor.exitHeaderFooterModeIfActive();
    GridEditor.setActive(false);
    PageLayout.setMarginsMm(tpl ? tpl.marginsMm : null);
    layerGridsStale = false;
    Editor.setHTML('');
    Editor.setHeaderFooterData(tpl ? tpl.headerFooter : null);
    if (templateNameInput) templateNameInput.value = tpl ? tpl.nom : '';
    if (pdfFilenameInput) { pdfFilenameInput.value = tpl ? (tpl.nomFichierPDF || '') : ''; pdfFilenameInput.hidden = true; }
    currentTypeModele = 'macro';
    if (emailFieldsRow) emailFieldsRow.hidden = true;
    emailFieldsRawCache = null;
    [emailSubjectInput, emailToInput, emailCcInput, emailCciInput].forEach(el => { if (el) { el.value = ''; el.readOnly = false; } });
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
    Comments.loadForTemplate(tpl ? tpl.id : null).catch(e => console.error('[main] chargement des commentaires impossible', e));
    MacroEditor.showSummary(tpl);
    syncEditorVisibilityForMode();
    applyPageFitZoomToBoth();
    if (currentMode === 'read') renderReader();
    syncDefaultTemplateButton();
    OrientationToggle.sync(currentTypeModele);
    resetAutosaveState(tpl);
  }

  // Bascule editor-container/macro-summary-container/reader-container selon le mode courant ET le type du modèle chargé - factorisé plutôt que dupliqué
  // entre switchMode() et loadMacroIntoEditor()/loadTemplateIntoEditor() (un changement de modèle en pleine édition ne repasse jamais par switchMode()).
  function syncEditorVisibilityForMode() {
    const showEditor = currentMode === 'edit' && currentTypeModele !== 'macro';
    const showMacroSummary = currentMode === 'edit' && currentTypeModele === 'macro';
    editorContainer.style.display = showEditor ? 'block' : 'none';
    // La bande de la barre de la case d'une grille (css/grid.css) disparaît avec l'éditeur : Lecture, résumé d'un macro-modèle.
    document.body.classList.toggle('pp-editor-hidden', !showEditor);
    if (macroSummaryContainer) macroSummaryContainer.style.display = showMacroSummary ? 'block' : 'none';
    // Les barres flottantes d'une bulle, d'un tableau ou d'une image sont ancrées dans l'éditeur : masqué (Lecture, résumé d'un macro-modèle), elles n'ont plus rien à
    // montrer. Sans cela la barre d'une bulle restée sélectionnée sautait en haut à gauche (8, 8), par-dessus les boutons Lecture et Édition : un clic réel sur « Lecture »
    // fermait la barre (EditorCore.hideFloatingContextToolbars) mais le blur de l'éditeur qui suit la réaffichait aussitôt, et le passage au clavier ne la fermait jamais.
    // Le panneau Rechercher / Remplacer (js/find-replace.js) cherche dans l'éditeur : masqué, il se ferme sans lui rendre le clavier.
    if (!showEditor) { EditorCore.hideFloatingContextToolbars(); FindReplace.close({ focus: false }); }
    // Un modèle chargé pendant que l'éditeur était masqué (Lecture, macro-modèle) n'a pas pu être mesuré : ses colonnes sont ajustées maintenant qu'il a une
    // mise en page. Sans cela un tableau resté trop large pour la page ne rentrait qu'à la prochaine frappe. Ce n'est pas une modification de la personne :
    // l'état « à enregistrer » reste celui d'avant, sinon un simple retour au Mode édition réécrirait le modèle à la prochaine passe d'auto-save (le chargement
    // d'un modèle remet cet état à zéro en dernière ligne de loadTemplateIntoEditor, pour la même raison).
    if (showEditor) {
      const wasDirty = autosaveDirty;
      Editor.refreshLayout();
      if (!wasDirty && autosaveDirty) { autosaveDirty = false; updateSaveStatus(); }
      // Orientation changée pendant que l'éditeur était masqué : la grille page des images en calque est recapturée maintenant qu'il a une mise en page.
      recaptureStaleLayerGrids();
    }
  }

  // forcedTypeModele : n'a d'effet que pour tpl=null (nouveau modèle vide, cf. onNew/onNewEmail) - un tpl existant porte déjà son propre typeModele
  // (Templates.loadAll()), jamais réécrit ici.
  function loadTemplateIntoEditor(tpl, forcedTypeModele) {
    if (tpl && tpl.typeModele === 'macro') { loadMacroIntoEditor(tpl); return; }
    closeTemplateRenameEditor();
    // Changer de modèle en pleine édition d'en-tête/pied de page laisserait sinon le contenu d'en-tête chargé à la place du document principal qu'on
    // s'apprête à écraser - même garde que Save/Export/Mode Lecture.
    Editor.exitHeaderFooterModeIfActive();
    // Le garde-fou d'une grille (js/grid-editor.js) refuse tout contenu qui n'est pas « un tableau » : levé AVANT de charger celui d'un autre modèle, reposé plus bas
    // si ce modèle est lui-même une grille.
    GridEditor.setActive(false);
    // Marges posées AVANT setHTML : les zones 2-colonnes en mode mm calculent --layout-left dès leur toute première construction (par setHTML) à partir
    // de PageLayout.getContentWidthMm() - les poser après aurait rendu une 1ère passe avec les marges du modèle PRÉCÉDENT.
    PageLayout.setMarginsMm(tpl ? tpl.marginsMm : null);
    layerGridsStale = false; // les grilles d'un modèle chargé sont celles de SA propre orientation
    Editor.setHTML(tpl ? tpl.contenu : '', tpl ? tpl.suiviModifications : null);
    Editor.setHeaderFooterData(tpl ? tpl.headerFooter : null);
    if (templateNameInput) templateNameInput.value = tpl ? tpl.nom : '';
    if (pdfFilenameInput) {
      pdfFilenameInput.value = tpl ? (tpl.nomFichierPDF || '') : '';
      // Toujours replié au chargement d'un modèle (Antoine, 2026-09-19 : l'UI de base doit rester
      // clean par défaut), même si un nom est déjà configuré - le crayon (cf. wirePdfFilenameToggle)
      // le déplie à la demande, la valeur elle-même n'est jamais perdue.
      pdfFilenameInput.hidden = true;
    }
    currentTypeModele = tpl ? (tpl.typeModele || 'document') : (forcedTypeModele || 'document');
    if (emailFieldsRow) emailFieldsRow.hidden = currentTypeModele !== 'email';
    // Un changement de modèle invalide tout cache de valeurs brutes en attente de restauration (cf. updateEmailFieldsDisplay) - reparti d'un état brut pour
    // CE modèle, la résolution (si on est déjà en Lecture) est redemandée plus bas.
    emailFieldsRawCache = null;
    [emailSubjectInput, emailToInput, emailCcInput, emailCciInput].forEach(el => { if (el) el.readOnly = false; });
    if (emailSubjectInput) emailSubjectInput.value = tpl ? (tpl.objet || '') : '';
    if (emailToInput) emailToInput.value = tpl ? (tpl.destinataires || '') : '';
    if (emailCcInput) emailCcInput.value = tpl ? (tpl.cc || '') : '';
    if (emailCciInput) {
      emailCciInput.value = tpl ? (tpl.cci || '') : '';
      // Reste visible si une Cci est déjà configurée - même précaution que pdfFilenameInput ci-dessus.
      emailCciInput.hidden = !emailCciInput.value.trim();
      if (emailCciToggle) emailCciToggle.classList.toggle('is-active', !emailCciInput.hidden);
    }
    MainToolbar.setEmailMode(currentTypeModele === 'email');
    MainToolbar.setMacroMode(false);
    MainToolbar.setGridMode(GridEditor.isGridType(currentTypeModele));
    syncExportRowsForModelType();
    HeaderFooterPreview.setEmailMode(currentTypeModele === 'email');
    // Une grille n'a pas de feuille A4 : la classe a4-preview sort des conteneurs AVANT que la mise en page (syncEditorVisibilityForMode) et la pagination ne
    // mesurent quoi que ce soit.
    syncA4PreviewForModelType();
    GridEditor.setActive(GridEditor.isGridType(currentTypeModele));
    if (macroSummaryContainer) macroSummaryContainer.style.display = 'none';
    syncEditorVisibilityForMode();
    // Le facteur d'ajustement dépend de la largeur de la page du NOUVEAU modèle (portrait ou paysage), et le conteneur garde sa taille : l'observateur de
    // redimensionnement (wirePageFitZoom) ne le recalculerait pas. Posé avant les rafraîchissements qui suivent (pagination, Lecture).
    applyPageFitZoomToBoth();
    // Editor.setHTML() plus haut a déjà déclenché un premier rendu de l'aperçu paginé (onUpdate ->
    // schedulePaginationRecompute) AVANT que setEmailMode ci-dessus ne soit posé - sans ce rafraîchissement
    // explicite, les zones de marge cliquables garderaient l'état verrouillé/déverrouillé du modèle
    // PRÉCÉDENT jusqu'à la prochaine frappe.
    Editor.refreshPaginationPreview();
    MainToolbar.syncToolbarState();
    if (btnCreateEmail) btnCreateEmail.hidden = currentTypeModele !== 'email';
    Templates.setCurrentId(tpl ? tpl.id : null);
    Comments.loadForTemplate(tpl ? tpl.id : null).catch(e => console.error('[main] chargement des commentaires impossible', e));
    const headingNumberingSelect = document.getElementById('v2-heading-numbering-select');
    if (headingNumberingSelect) headingNumberingSelect.value = Editor.getHeadingNumberingStyle();
    // Changer de modèle ne touchait jusqu'ici que #editor-container (caché en mode Lecture) - #reader-container ne se rafraîchissait donc jamais tant qu'on
    // ne repassait pas explicitement par "Mode édition" puis "Mode lecture" (le changement de modèle semblait alors "ne rien faire" en mode Lecture).
    if (currentMode === 'read') renderReader();
    if (currentMode === 'read') updateEmailFieldsDisplay();
    updateEmailLengthGauge();
    syncDefaultTemplateButton();
    OrientationToggle.sync(currentTypeModele);
    // DERNIÈRE ligne de cette fonction (pas avant) : Editor.setHTML()/setHeaderFooterData() juste au-dessus déclenchent leurs propres transactions
    // ProseMirror, donc leur propre `editor.on('update')` - sans ça, charger un modèle se marquerait lui-même "modifié" aux yeux de l'auto-save.
    resetAutosaveState(tpl);
  }

  let nameBeforeEdit = null; // le nom du modèle quand le crayon a ouvert le champ ; null hors saisie
  // Le select choisit/affiche le modèle courant, le crayon fait apparaître l'input à sa place pour le renommer : hidden sur le <select> réel suffit,
  // js/template-tree-select.js masque alors son déclencheur (sans cela le champ s'ouvrait à côté de la liste). Le renommage ne touche que l'affichage local
  // : la persistance reste au prochain clic sur Enregistrer (ou à l'enregistrement automatique, qui voit la saisie).
  function closeTemplateRenameEditor() {
    if (!templateNameInput || !templateSelect) return;
    templateNameInput.hidden = true;
    templateSelect.hidden = false;
    nameBeforeEdit = null;
  }

  // Le nom sous lequel le modèle vient d'être enregistré : celui de la galerie, ou « nom (2) » s'il existait déjà (les messages de la galerie disent le nom retenu).
  function savedTemplateName(fallback) {
    const name = templateNameInput ? templateNameInput.value.trim() : '';
    return name || fallback;
  }

  // Un nom déjà pris par un autre modèle devient « nom (2) », « nom (3) »... (demande d'Antoine du 01/10). Posé quand la saisie est VALIDÉE (Entrée, clic ailleurs, enregistrement),
  // jamais à chaque lettre : le champ ne change pas sous les doigts de la personne qui tape, et l'enregistrement automatique, qui n'écrit que le nom courant, n'y touche pas.
  // Un modèle déjà enregistré dont le nom n'a pas changé reste tel quel, même si un doublon d'avant cette règle existe : seul un nom NOUVEAU est vérifié (modèle pas encore
  // enregistré, ou nom changé depuis l'ouverture du crayon). Rend le nom retenu ; s'il a changé, le champ le prend et le coin d'état dit pourquoi.
  function settleTemplateName() {
    if (!templateNameInput) return '';
    const typed = templateNameInput.value.trim();
    if (!typed) return typed;
    const id = Templates.getCurrentId();
    const stored = id == null ? null : Templates.getCached().find(t => String(t.id) === String(id));
    // Pas encore enregistré (id nul : nouveau modèle, copie, galerie) : le nom est toujours vérifié.
    const previous = id == null ? null : (nameBeforeEdit != null ? nameBeforeEdit : (stored ? stored.nom : null));
    if (previous != null && Templates.sameName(typed, previous)) return typed;
    const unique = Templates.uniqueName(typed, id);
    if (unique !== typed) {
      templateNameInput.value = unique;
      markAutosaveDirty(); // le nom a pu être écrit tel que tapé par un passage de l'enregistrement automatique : le prochain écrit le nouveau
      // Enregistrement automatique coupé, le coin d'état garde « Modifications non enregistrées. » : ce message-là protège ce qui n'est écrit nulle part, le nouveau nom se lit dans le titre.
      if (isAutosaveEnabled()) setStatus(I18n.t('status.nameExists', { name: unique }));
    }
    return unique;
  }

  function wireTemplateRename() {
    const renameBtn = document.getElementById('btn-rename-template');
    if (!renameBtn || !templateNameInput || !templateSelect) return;
    function openEditor() {
      // Le champ reprend la largeur du nom qu'il remplace (120 px au moins) : la barre ne bouge pas, et à 700 px elle ne passe pas sur une deuxième ligne.
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
        // Même libellé que refreshTemplateList : l'étoile du modèle par défaut reste, la liste le montre avec le nouveau nom jusqu'à l'enregistrement.
        const isDefault = opt.value !== '' && String(Templates.getDefaultId()) === String(opt.value);
        opt.textContent = isDefault ? (templateNameInput.value.trim() + ' ★') : templateNameInput.value.trim();
      }
      closeTemplateRenameEditor();
    }
    renameBtn.addEventListener('click', () => { templateNameInput.hidden ? openEditor() : commitAndClose(); });
    templateNameInput.addEventListener('blur', commitAndClose);
    templateNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') templateNameInput.blur(); });
  }

  // === Quitter le modèle courant avec des modifications en attente ===
  // Changer de modèle, créer un document, un email ou une grille, ou en créer un depuis la galerie remplace le contenu de l'éditeur : ce qui attendait d'être
  // enregistré (autosaveDirty : enregistrement automatique coupé, ou allumé mais dans les 2,5 s d'avant le prochain passage) disparaissait sans rien demander.
  // Choix d'Antoine du 01/10, « Toujours demander » : une fenêtre Enregistrer / Abandonner / Annuler, que l'enregistrement automatique soit allumé ou non.
  // Pas de question quand rien n'attend, ni en lecture seule (rien ne s'enregistre pour cette personne), ni pour un macro-modèle (il s'édite dans sa fenêtre).
  // Les appelants gardent leur chemin synchrone quand il n'y a rien à demander : `if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return;`.
  function hasEditsToConfirmBeforeLeaving() {
    return autosaveDirty && !isReadOnly() && currentTypeModele !== 'macro';
  }

  // true : on peut continuer (« Abandonner », ou « Enregistrer » réussi) ; false : la personne reste (« Annuler », Échap, enregistrement refusé : le message d'erreur
  // est alors dans le coin d'état). Sans nom il n'y a pas d'« Enregistrer » : un nouveau modèle jamais enregistré ne peut pas l'être tant qu'il n'en a pas.
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
    // Annuler : la personne reprend où elle en était. Ouverte depuis une ligne de menu (une étiquette que la souris ne focalise pas), la fenêtre n'avait rien à rendre : le
    // bouton qu'on vient de cliquer, tout juste caché, garde le focus jusqu'au prochain rendu, d'où le test « n'est plus affiché » en plus du focus sur <body>.
    const active = document.activeElement;
    if (currentMode === 'edit' && (!active || active === document.body || active.getClientRects().length === 0)) EditorCore.getEditor().commands.focus();
    return false;
  }

  async function onTemplateSelectChange() {
    const id = templateSelect.value;
    if (hasEditsToConfirmBeforeLeaving()) {
      // La liste referme son menu et rend le focus à son bouton juste après cet évènement : la question vient après, sinon ce focus passerait derrière la fenêtre.
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
    const tpl = Templates.getCached().find(t => String(t.id) === String(id));
    if (tpl) loadTemplateIntoEditor(tpl);
  }

  // loadTemplateIntoEditor(null) appelle resetAutosaveState(null) -> updateSaveStatus(), qui affiche déjà l'avertissement "modèle non enregistré"
  // (cf. plus haut) : ne PAS l'écraser après coup avec un message générique, sinon cet avertissement disparaîtrait pile au moment où il est le plus
  // utile (juste après avoir cliqué "Nouveau modèle"). Sans question : onDelete l'appelle quand le modèle courant vient d'être supprimé.
  function startBlankDocument() {
    templateSelect.value = '';
    loadTemplateIntoEditor(null);
  }

  async function onNew() {
    if (isReadOnly()) return;
    if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return;
    startBlankDocument();
  }

  // Même schéma qu'onNew() - seule différence, le 2e argument qui bascule le bandeau Objet/À/Cc/Cci et le verrouillage de la toolbar.
  async function onNewEmail() {
    if (isReadOnly()) return;
    if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return;
    templateSelect.value = '';
    loadTemplateIntoEditor(null, 'email');
  }

  // Même schéma encore : une nouvelle grille est un modèle vide d'un type fixé à la création (un tableau de départ, posé par GridEditor.setActive).
  async function onNewGrid() {
    if (isReadOnly()) return;
    if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return;
    templateSelect.value = '';
    loadTemplateIntoEditor(null, GridEditor.TYPE);
  }

  // Un nouveau macro-modèle n'a rien à "charger" avant d'avoir été composé et enregistré au moins une fois (contrairement à onNew/onNewEmail, qui vident
  // l'éditeur immédiatement) - ouvre directement l'écran de composition, vide.
  function onNewMacro() {
    if (isReadOnly()) return;
    MacroEditor.openModal(null);
  }

  // Rappel de MacroEditor après "Enregistrer" dans sa modale (nouveau macro-modèle ou modification d'un existant) - même geste que la fin d'onSave() :
  // rafraîchir la liste, sélectionner ce qui vient d'être enregistré, resynchroniser le bouton "par défaut".
  // renamedTo : le nom retenu quand celui qui était demandé existait déjà (« nom (2) »), le coin d'état le dit à la place de « Macro-modèle enregistré ».
  async function onMacroSaved(id, renamedTo) {
    await refreshTemplateList();
    const done = () => setStatus(renamedTo ? I18n.t('status.nameExists', { name: renamedTo }) : I18n.t('status.macroSaved'));
    // Le macro-modèle est enregistré dans tous les cas ; le charger remplace l'éditeur, donc les modifications en attente du modèle qu'on quitte : même question.
    if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) { done(); return; }
    templateSelect.value = id;
    const tpl = Templates.getCached().find(t => String(t.id) === String(id));
    loadTemplateIntoEditor(tpl);
    syncDefaultTemplateButton();
    done();
  }

  // Un macro-modèle s'édite exclusivement via sa modale (MacroEditor) - jamais Editor.getHTML() (toujours vide pour ce type, cf. loadMacroIntoEditor), qui
  // écraserait silencieusement ses slots avec un contenu vide si on laissait passer le chemin normal ci-dessous. "Enregistrer" rouvre donc directement la
  // modale plutôt que d'enregistrer quoi que ce soit lui-même.
  async function onSave() {
    if (isReadOnly()) return; // Ctrl+S compris (wireSaveShortcut) : le bouton, lui, est déjà grisé
    if (currentTypeModele === 'macro') {
      const id = Templates.getCurrentId();
      const tpl = id != null ? Templates.getCached().find(t => String(t.id) === String(id)) : null;
      MacroEditor.openModal(tpl);
      return;
    }
    Editor.exitHeaderFooterModeIfActive();
    const id = Templates.getCurrentId();
    const typedName = templateNameInput ? templateNameInput.value.trim() : '';
    const nom = settleTemplateName(); // nom déjà pris : « nom (2) »... (la saisie du crayon, une copie, un modèle de la galerie passent tous par ici)
    if (!nom) { setStatus(I18n.t('status.templateNameRequired'), true); return; }
    let savedId, dateModif;
    try {
      const suiviModifications = await Editor.getSuiviModificationsForSave();
      ({ id: savedId, dateModif } = await Templates.save(id, nom, Editor.getHTML(), getPdfFilenameTemplate(), Editor.getHeaderFooterData(), PageLayout.getMarginsMm(), currentTypeModele, getEmailFieldsFromInputs(), suiviModifications));
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
    if (nom !== typedName) setStatus(I18n.t('status.nameExists', { name: nom })); // à la place de « Enregistré à… » : le nom a changé, c'est ce qu'il faut lire
  }

  // La copie est proposée sous le premier nom libre (« Contrat (2) » pour « Contrat ») : Entrée suffit, la saisie est sélectionnée pour la remplacer d'une frappe.
  async function onSaveAs() {
    if (isReadOnly()) return;
    const currentName = templateNameInput ? templateNameInput.value.trim() : '';
    const asked = await Dialogs.prompt({ title: I18n.t('toolbar.saveAs'), label: I18n.t('prompt.newTemplateName'), value: Templates.uniqueName(currentName), confirmLabel: I18n.t('common.save') });
    if (!asked) return;
    const nom = asked.trim();
    if (!nom) return;
    // Copie un macro-modèle par sa composition (mêmes slots, nouvel id Grist) plutôt que de passer par onSave() ci-dessus, qui rouvrirait la modale au
    // lieu d'enregistrer quoi que ce soit - "sous" doit ici dupliquer directement, comme pour un document normal.
    if (currentTypeModele === 'macro') {
      const id = Templates.getCurrentId();
      const tpl = id != null ? Templates.getCached().find(t => String(t.id) === String(id)) : null;
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

  // === Droits par personne (js/access-rights.js, demande d'Antoine du 2026-09-28) ===
  // Verrou d'interface seulement : grise (classe pp-access-locked, jamais masqué ni retiré), et les gardes des fonctions d'action (onSave, switchMode,
  // withExportLock, autosaveTick...) couvrent les raccourcis clavier et les appels directs. Seules les règles d'accès de Grist protègent les données.
  const ACCESS_LOCK_CLASS = 'pp-access-locked';
  // Tout ce qui modifie le modèle ou écrit dans Grist, en plus de la barre de mise en forme entière (#v2-toolbar, sauf Commenter qui suit son propre droit).
  const READ_ONLY_LOCKED_IDS = ['v2-new-template-group', 'btn-organize-templates', 'v2-save-group', 'btn-delete', 'btn-link-rules',
    'btn-mode-edit', 'btn-rename-template', 'btn-set-default-template', 'v2-pdf-filename-cluster', 'v2-page-group'];
  // Le droit d'export couvre PDF (une ligne, ZIP, PDF unique), Word et la création d'email : #v2-quality-group porte aussi les deux exports DOCX.
  const EXPORT_LOCKED_IDS = ['v2-quality-group', 'v2-export-pdf-group', 'btn-create-email'];
  const READ_ONLY_DISABLED_INPUTS = ['settings-margin-top', 'settings-margin-right', 'settings-margin-bottom', 'settings-margin-left'];
  // Réglage présent au démarrage : les droits sont attendus avant le premier affichage, au plus ce délai (Grist qui tarde à répondre) - au-delà le widget
  // démarre verrouillé (AccessRights.get() tant que le calcul n'a pas abouti) et se déverrouille seul à la réponse.
  const ACCESS_STARTUP_WAIT_MS = 5000;

  function isReadOnly() { return AccessRights.get().readOnly; }

  function setAccessLocked(el, locked) {
    if (!el) return;
    el.classList.toggle(ACCESS_LOCK_CLASS, locked);
    if (locked) el.setAttribute('aria-disabled', 'true');
    else el.removeAttribute('aria-disabled');
  }

  // Barre de mise en forme et d'insertion (#v2-toolbar) : grisée en lecture seule ET dès que le mode Lecture est affiché, choisi ou imposé. L'éditeur y est
  // masqué mais ses commandes restaient actives : un clic sur Tableau, Sommaire ou Citation modifiait le modèle caché, et l'auto-save l'enregistrait sans
  // rien montrer (audit du 2026-09-29, F1). Commenter suit son propre droit, jamais le mode : dans la Lecture il agit sur le texte sélectionné DANS la
  // Lecture (applyCommentsPermissions). Modes, aperçu A4, réglages, arbre des modèles et export ne font pas partie de #v2-toolbar : ils restent actifs.
  // Rappelée par applyAccessRights (droits) et switchMode (mode).
  function applyFormattingBarLock() {
    const formattingBar = document.getElementById('v2-toolbar');
    if (!formattingBar) return;
    const locked = isReadOnly() || currentMode === 'read';
    Array.from(formattingBar.children).forEach(child => { if (child.id !== 'v2-btn-comment') setAccessLocked(child, locked); });
  }

  // Commentaires : le mode Lecture les montre et en accepte de nouveaux (js/comments.js:readerMode) dès qu'il est affiché, imposé par la lecture seule ou
  // choisi, pour toute personne qui a le droit de commenter (choix d'Antoine du 2026-09-30, « Commenter dans la Lecture »). Avant, Commenter d'un mode
  // Lecture choisi posait sa marque sur la sélection de l'éditeur masqué, enregistrée sans rien montrer. En Édition, Commenter agit sur l'éditeur, comme
  // toujours. Rappelée par applyAccessRights (droits) et switchMode (mode, AVANT le dessin du mode Lecture : renderReader lit cet état).
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

  // Droits changés en cours de session (case cochée dans la table, réglage modifié) : switchMode force lui-même le mode Lecture en lecture seule ; sinon
  // un mode Lecture déjà affiché est redessiné, commentaires montrés ou non.
  function onAccessRightsChange() {
    applyAccessRights();
    if (isReadOnly() || currentMode === 'read') switchMode(currentMode);
  }

  // Un clic (souris, clavier, ou .click() d'un autre module) sur une commande grisée par applyAccessRights ou applyFormattingBarLock est arrêté en capture,
  // avant tout gestionnaire.
  function wireAccessLockGuard() {
    document.addEventListener('click', event => {
      const target = event.target;
      if (!target || !target.closest || !target.closest('.' + ACCESS_LOCK_CLASS)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
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
  // La question « Enregistrer / Abandonner / Annuler » est posée (askBeforeLeaving) : l'enregistrement automatique n'écrit rien pendant ce temps, sinon « Abandonner » ne
  // laisserait rien à abandonner - ce que la personne a tapé serait déjà enregistré.
  let leavePromptOpen = false;

  function isAutosaveEnabled() {
    try { return localStorage.getItem(AUTOSAVE_ENABLED_STORAGE) !== 'false'; } // absent = activé par défaut
    catch (e) { return true; } // stockage indisponible (navigation privée, quota) : on se comporte comme si c'était activé plutôt que de le figer désactivé
  }

  function setAutosaveEnabled(enabled) {
    try { localStorage.setItem(AUTOSAVE_ENABLED_STORAGE, enabled ? 'true' : 'false'); } catch (e) { /* choix non persisté, reste actif pour cette session */ }
  }

  // Aspect du bouton Enregistrer d'après ce réglage (retour d'Antoine du 01/10) : bleu et blanc enregistrement automatique allumé, noir et blanc classique coupé. Posé dès
  // le début d'init(), avant toute attente de Grist, pour que le bouton ne reste pas bleu le temps du chargement chez qui a coupé l'enregistrement automatique.
  function syncSaveButtonLook() {
    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.classList.toggle('is-autosave-off', !isAutosaveEnabled());
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
  // est bien en base, rien sinon (brouillon jamais enregistré, frappe en attente, conflit non résolu) - sauf enregistrement automatique coupé, où une frappe en attente le dit.
  function updateSaveStatus() {
    // Lecture seule (js/access-rights.js) : rien ne s'enregistre pour cette personne, « Enregistré à… » ou « modèle non enregistré » n'auraient pas de sens.
    if (isReadOnly()) { setStatus(I18n.t('status.readOnly')); return; }
    // Aucun modèle enregistré du tout (pas encore de ligne Grist) : autosaveTick() ne peut structurellement rien faire tant que ça dure (il refuse de
    // CRÉER un modèle, cf. son "if (!id) return" plus bas) - un statut vide laissait croire, à tort, que tout allait bien pendant que rien n'était
    // jamais protégé par l'auto-save. Même style d'alerte que templateNameRequired (onSave) : même cause réelle, pas encore de nom/ligne Grist.
    if (!Templates.getCurrentId()) { setStatus(I18n.t('status.unsavedTemplateWarning'), true); return; }
    // Enregistrement automatique coupé (retours d'Antoine du 01/10 : sa bascule barrée a quitté la barre, cet état ne se voyait plus que dans le menu d'Enregistrer) : rien ne partira
    // tout seul, ce qui vient d'être tapé n'est nulle part ailleurs que dans l'éditeur - le coin d'état le dit tant que ça dure, jusqu'au prochain Enregistrer. Seulement dans ce cas :
    // enregistrement automatique actif, le délai entre une frappe et le passage suivant ne dure que 2,5 s et le coin reste vide, comme avant. Avant le test de DateModif : un modèle
    // sans date connue doit pourtant le dire.
    if (autosaveDirty && !autosaveConflictActive && !isAutosaveEnabled()) {
      setStatus(I18n.t('status.unsavedChanges'));
      statusMsg.classList.add('is-unsaved');
      return;
    }
    if (!autosaveLastKnownDateModif) { setStatus(''); return; }
    if (autosaveDirty || autosaveConflictActive) { setStatus(''); return; }
    setStatus(I18n.t('status.savedAt', { time: formatSaveTime(autosaveLastKnownDateModif) }));
  }

  // autosaveLastKnownDateModif vient de Templates.save()/loadAll(), qui relisent toutes deux DateModif via
  // fetchTable() : Grist représente une colonne DateTime comme des SECONDES entières depuis l'epoch, jamais
  // des millisecondes (dev-tests/grist-stub.js:61-76 reproduit ce comportement) - malgré son nom, ce n'est
  // pas la chaîne ISO qu'on a envoyée. new Date(secondes) la traite à tort comme des millisecondes, ce qui
  // affichait une heure quasi figée (ex. "Enregistré à 18:22:59" en continu) et donnait à tort l'impression
  // que l'enregistrement ne marchait pas plutôt qu'un simple bug d'affichage (signalé le 2026-09-28).
  // Mais readBackDateModif (js/templates.js) retombe sur la chaîne ISO d'origine (pas un nombre) si la
  // relecture échoue (colonne/ligne introuvable, requête en échec) - un simple `*1000` sur cette chaîne
  // donne NaN, et new Date(NaN).toLocaleTimeString() renvoie littéralement "Invalid Date" à l'écran plutôt
  // que de lever (le catch ci-dessous ne l'attrape donc pas) : les deux représentations doivent être gérées.
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

  async function autosaveTick() {
    if (leavePromptOpen) return;
    if (!isAutosaveEnabled()) return; // désactivé par l'utilisateur (cf. wireSaveMenu) - aucun appel Grist tant que c'est le cas, pas seulement le
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
    // Lecture seule : la vérification de conflit ci-dessus garde son bandeau (le modèle a changé ailleurs), mais rien n'est écrit. Un commentaire posé en
    // Lecture passe par saveReaderCommentAnchors, jamais par ici.
    if (isReadOnly()) return;
    // getHTML() renverrait le fragment en-tête/pied actuellement chargé, pas le document principal (cf. header-footer-preview.js) - on saute ce tick
    // plutôt que de forcer une sortie de ce mode toutes les ~2-3s (bien plus perturbant que d'attendre le tick suivant).
    if (Editor.isEditingHeaderFooter()) return;
    const nom = templateNameInput ? templateNameInput.value.trim() : '';
    if (!nom) return; // même garde que le bouton Enregistrer manuel
    // Un macro-modèle n'a rien dans l'éditeur (Editor.getHTML() est toujours vide, cf. loadMacroIntoEditor) : son Contenu est sa composition, réécrite telle que Grist vient de la rendre
    // (remoteTpl, relu plus haut). Renommer le macro-modèle, changer son nom de PDF ou ses marges remplaçait sinon sa composition par un paragraphe vide, en moins de 3 s. Macro-modèle
    // introuvable dans Grist (supprimé ailleurs) : rien n'est écrit, jamais une composition inventée.
    const isMacro = currentTypeModele === 'macro';
    if (isMacro && !remoteTpl) return;
    try {
      const suiviModifications = isMacro ? null : await Editor.getSuiviModificationsForSave();
      const contenu = isMacro ? remoteTpl.contenu : Editor.getHTML();
      const { dateModif } = await Templates.save(id, nom, contenu, getPdfFilenameTemplate(), Editor.getHeaderFooterData(), PageLayout.getMarginsMm(), currentTypeModele, getEmailFieldsFromInputs(), suiviModifications);
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

  // Menu « Enregistrer » (retours d'Antoine du 01/10, points 5 et 6) : le bouton garde son geste - un clic, un enregistrement - et son survol ouvre dessous
  // « Enregistrer sous… » (une copie) et la case « Enregistrement automatique » (activé par défaut), qui remplacent le bouton « Enregistrer sous » et la bascule qui
  // occupaient la barre. Même mécanisme que les autres boutons à menu (.v2-hover-group, css/editor-v2.css).
  // - Le bouton ne prend pas le focus à la souris, comme tout bouton de menu au survol (délégation de js/editor-core.js : sinon son menu, :focus-within, restait affiché
  //   une fois la souris partie, et le curseur quittait le texte en cours) ; un champ de saisie qui l'avait (renommage...) le perd au clic, avant onSave, donc le nom
  //   validé est bien celui qui s'enregistre. Les lignes du menu en font autant ici : ce sont des <span tabindex="0">, que la souris focaliserait sinon.
  // - tabindex="0" et Entrée/Espace sur les lignes : « Enregistrer sous » était un vrai bouton, atteignable au clavier ; des <span> ne le seraient pas. Le menu reste
  //   ouvert tant que le focus est dedans. Au clavier, « Enregistrer sous… » met d'abord le focus sur le bouton : la fenêtre qu'elle ouvre le lui rend à sa fermeture, et
  //   une ligne de menu refermée ne peut pas le recevoir.
  // - La boucle setInterval de l'auto-save tourne TOUJOURS une fois démarrée, seul autosaveTick() vérifie isAutosaveEnabled() en tout premier : décocher ne l'arrête
  //   pas (rien à recréer à la réactivation), ça fait juste sauter les ticks, à un coût négligeable (une lecture localStorage toutes les 2.5 s).
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
    // La coche du menu et l'aspect du bouton disent le même état (retour d'Antoine du 01/10).
    const syncAutosaveRow = () => {
      if (autosaveRow) autosaveRow.setAttribute('aria-checked', isAutosaveEnabled() ? 'true' : 'false');
      syncSaveButtonLook();
    };
    const toggleAutosave = () => {
      const enabled = !isAutosaveEnabled();
      setAutosaveEnabled(enabled);
      syncAutosaveRow();
      setStatus(I18n.t(enabled ? 'status.autosaveEnabled' : 'status.autosaveDisabled'));
      // Coupé avec des modifications déjà en attente : l'indicateur « Modifications non enregistrées » passe devant le message du geste, qui n'aurait été lu qu'un instant.
      if (!enabled && autosaveDirty) updateSaveStatus();
      // Réactiver ne remet RIEN à zéro : resetAutosaveState() effaçait aussi autosaveDirty, donc ce qui avait été tapé pendant la coupure n'était jamais enregistré
      // (le coin d'état annonçait pourtant « Enregistré à… ») et un changement fait ailleurs pendant ce temps passait sans bandeau de conflit. Rien n'est à
      // re-synchroniser : onSave et le chargement d'un modèle tiennent autosaveLastKnownDateModif à jour même éteint, le prochain tick enregistre ce qui est en
      // attente comme si on n'avait jamais coupé, ou ouvre le bandeau si le modèle a changé ailleurs entre-temps.
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
    // Le choix est par navigateur : un autre onglet (ou un autre widget du même document) qui le change se voit ici aussi, sans attendre un rechargement. L'évènement ne part que dans
    // les AUTRES pages ; `key` vaut null quand tout le stockage est vidé.
    window.addEventListener('storage', (event) => {
      if (event.key !== null && event.key !== AUTOSAVE_ENABLED_STORAGE) return;
      syncAutosaveRow();
      if (autosaveDirty) updateSaveStatus();
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

  // Slots du macro-modèle actuellement chargé (Templates.getCurrentId()), ou une liste vide si aucun/pas macro - jamais null, pour épargner aux appelants
  // la vérification.
  function getCurrentMacroSlots() {
    const id = Templates.getCurrentId();
    const tpl = id != null ? Templates.getCached().find(t => String(t.id) === String(id)) : null;
    return (tpl && tpl.macroSlots) ? tpl.macroSlots : { slots: [] };
  }

  // Pour un macro-modèle, le "contenu" à résoudre n'est jamais Editor.getHTML() (toujours vide, cf. loadMacroIntoEditor) mais le résultat de la
  // concaténation des modèles retenus pour CETTE ligne/table (MacroTemplates.buildConcatenatedHtml) - même ligne pour la page de garde et les annexes
  // (décision d'Antoine, 2026-09-20), donc un seul appel suffit ici.
  async function currentDocumentHtml(tableId, record) {
    if (currentTypeModele !== 'macro') return Editor.getHTML();
    if (!record || !tableId) return '';
    return MacroTemplates.buildConcatenatedHtml(getCurrentMacroSlots(), tableId, record, Templates.getCached());
  }

  async function renderReader(record, recordTableId) {
    if (typeof record === 'undefined') record = latestRecord || GristAPI.getCurrentRecord();
    let tableId = recordTableId || GristAPI.getCurrentTableId() || currentTableId;
    // Sans ligne sélectionnée, on délègue quand même à ReaderMode.render() pour qu'il affiche son état vide. Avant, ce `return` sec laissait
    // #reader-container littéralement vide : écran blanc sans explication, et le message prévu dans reader-mode.js était du code mort.
    // Note : onCreateEmail() (mode email) appelle aussi renderReader() alors que currentMode reste 'edit', pour lire le corps résolu sans changer de mode -
    // sans risque, #reader-container reste display:none tant que currentMode !== 'read' (cf. switchMode).
    if (!record) { await ReaderMode.render(await currentDocumentHtml(tableId, null), tableId, null, Editor.getHeaderFooterData()); return; }
    if (!tableId) {
      const ctx = await GristAPI.detectCurrentContext();
      if (ctx && ctx.tableId) { currentTableId = ctx.tableId; tableId = ctx.tableId; }
    }
    readerContainer.classList.toggle('pp-reader-comments', readerCommentsActive());
    const html = readerCommentsActive() ? await Comments.buildReaderHtml() : await currentDocumentHtml(tableId, record);
    await ReaderMode.render(html, tableId, record, Editor.getHeaderFooterData());
  }

  // Mode Lecture affiché (imposé par la lecture seule ou choisi) avec droit de commenter (js/comments.js:readerMode, applyCommentsPermissions) : il
  // montre les commentaires et en accepte de nouveaux, sur un HTML qui porte les positions du document. Jamais pour un macro-modèle : son contenu vient
  // d'autres modèles, pas de l'éditeur.
  function readerCommentsActive() { return Comments.isReaderMode() && currentTypeModele !== 'macro'; }

  // Commentaire posé, résolu ou supprimé depuis le mode Lecture : l'auto-save n'écrit rien en lecture seule (et n'a peut-être pas encore tourné quand le
  // mode Lecture est choisi), le modèle (sa marque de commentaire) est donc enregistré ici - et seulement s'il n'a pas changé ailleurs depuis son
  // chargement, sinon la marque écraserait ce changement (même contrôle de DateModif que autosaveTick). false = rien d'enregistré, js/comments.js annule
  // alors son changement de marque.
  async function saveReaderCommentAnchors() {
    const id = Templates.getCurrentId();
    if (!id || currentTypeModele === 'macro' || autosaveConflictActive) return false;
    const nom = templateNameInput ? templateNameInput.value.trim() : '';
    if (!nom) return false;
    let fresh;
    try { fresh = await Templates.loadAll(); }
    catch (e) { console.error('[main] commentaire en lecture : vérification de conflit impossible', e); return false; }
    const remoteTpl = fresh.find(t => String(t.id) === String(id));
    if (!remoteTpl) return false;
    if (autosaveLastKnownDateModif && remoteTpl.dateModif && remoteTpl.dateModif !== autosaveLastKnownDateModif) { showConflictBanner(remoteTpl); return false; }
    try {
      const suiviModifications = await Editor.getSuiviModificationsForSave();
      const { dateModif } = await Templates.save(id, nom, Editor.getHTML(), getPdfFilenameTemplate(), Editor.getHeaderFooterData(), PageLayout.getMarginsMm(), currentTypeModele, getEmailFieldsFromInputs(), suiviModifications);
      autosaveLastKnownDateModif = dateModif;
      autosaveDirty = false;
      updateSaveStatus();
      // Cache des modèles relu (Templates.save ne le touche pas) : revenir plus tard sur ce modèle doit montrer la marque qui vient d'être posée.
      Templates.loadAll().catch(e => console.error('[main] relecture des modèles impossible', e));
      return true;
    } catch (e) {
      console.error('[main] commentaire en lecture : échec d’enregistrement du modèle', e);
      return false;
    }
  }

  // Bascule l'affichage d'Objet/À/Cc/Cci entre gabarit brut (édition) et valeurs résolues (lecture) - MÊMES <input>, jamais dupliqués (cf.
  // emailFieldsRawCache ci-dessus). Sans ligne sélectionnée, garde les gabarits bruts affichés (rien à résoudre) plutôt qu'un champ vidé sans explication.
  async function updateEmailFieldsDisplay() {
    if (!emailFieldsRow || currentTypeModele !== 'email') return;
    const inputs = [emailSubjectInput, emailToInput, emailCcInput, emailCciInput];
    if (currentMode !== 'read') {
      if (!emailFieldsRawCache) return; // déjà en état brut, rien à restaurer
      const raw = emailFieldsRawCache;
      emailFieldsRawCache = null;
      if (emailSubjectInput) emailSubjectInput.value = raw.objet;
      if (emailToInput) emailToInput.value = raw.destinataires;
      if (emailCcInput) emailCcInput.value = raw.cc;
      if (emailCciInput) emailCciInput.value = raw.cci;
      inputs.forEach(el => { if (el) el.readOnly = false; });
      return;
    }
    if (!emailFieldsRawCache) {
      emailFieldsRawCache = getEmailFieldsFromInputs();
      inputs.forEach(el => { if (el) el.readOnly = true; });
    }
    const record = latestRecord || GristAPI.getCurrentRecord();
    if (!record) return;
    const tableId = latestRecordTableId || GristAPI.getCurrentTableId() || currentTableId;
    const raw = emailFieldsRawCache;
    const resolved = await resolveEmailFieldsForRecord(raw, tableId, record);
    // Repassé en édition (ou modèle changé) pendant la résolution : emailFieldsRawCache a déjà été traité par la branche ci-dessus, ne pas écraser son
    // travail avec ce résultat maintenant obsolète.
    if (currentMode !== 'read' || emailFieldsRawCache !== raw) return;
    if (emailSubjectInput) emailSubjectInput.value = resolved.objet;
    if (emailToInput) emailToInput.value = resolved.destinataires;
    if (emailCcInput) emailCcInput.value = resolved.cc;
    if (emailCciInput) emailCciInput.value = resolved.cci;
  }

  // Jauge de longueur mailto: (§4.4 du document) - PERMANENTE, sur l'URL RÉSOLUE (to+cc+cci+objet+corps), pas sur le gabarit tapé (un accent/retour à la
  // ligne coûte plus cher une fois encodé - cf. MailtoExport). Dépend de la ligne Grist sélectionnée : appelée à chaque changement de ligne, de modèle, ou
  // de contenu (avec un debounce, cf. scheduleEmailLengthGauge) - jamais bloquante, juste informative.
  let emailGaugeRunId = 0;
  async function updateEmailLengthGauge() {
    if (!emailCharCounter) return;
    if (currentTypeModele !== 'email') { emailCharCounter.hidden = true; return; }
    const runId = ++emailGaugeRunId;
    const record = latestRecord || GristAPI.getCurrentRecord();
    if (!record) { emailCharCounter.hidden = true; return; }
    const tableId = latestRecordTableId || GristAPI.getCurrentTableId() || currentTableId;
    const rawFields = getEmailFieldsFromInputs();
    const resolvedFields = await resolveEmailFieldsForRecord(rawFields, tableId, record);
    await renderReader(record, tableId);
    if (runId !== emailGaugeRunId) return; // une résolution plus récente a déjà pris le relais
    const resolvedContent = readerContainer.querySelector('.reader-content');
    const bodyText = MailtoExport.plainTextFromHtml(resolvedContent ? resolvedContent.innerHTML : readerContainer.innerHTML);
    const url = MailtoExport.buildMailtoUrl({ to: resolvedFields.destinataires, cc: resolvedFields.cc, bcc: resolvedFields.cci, subject: resolvedFields.objet, bodyText });
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
  // Un bouton grisé perd le focus (le navigateur le rend au corps de la page) : sans ce rappel, le clavier repartirait du début de la page à la fin d'un export ou
  // quand la fenêtre « Email trop long » se referme (elle n'a alors plus d'élément d'origine à retrouver). Seul un focus posé au clavier (cadre de focus visible)
  // est rendu : à la souris rien ne change. Rien n'est rendu si le focus est allé ailleurs pendant l'export ; un élément resté actif mais masqué (le bouton de la
  // fenêtre qui vient de se fermer) n'est pas un focus déplacé.
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
  // Les contrôles qu'un export en cours grise : tous les exports et « Créer l'email », pour qu'on ne lance pas un second export par-dessus le premier.
  const EXPORT_CONTROL_IDS = ['btn-export-pdf', 'v2-btn-export-pdf-batch', 'v2-btn-export-pdf-merged', 'v2-btn-export-docx', 'v2-btn-export-docx-batch', 'v2-btn-export-xlsx',
    'v2-btn-export-xlsx-batch', 'v2-btn-export-xlsx-single', 'btn-create-email'];
  function withExportLock(fn) {
    return async (...args) => {
      if (exportOperationInProgress || !AccessRights.get().canExport) return;
      exportOperationInProgress = true;
      const controls = EXPORT_CONTROL_IDS.map(id => document.getElementById(id));
      const keyboardFocus = keyboardFocusedElement();
      OrientationToggle.setBusy(true);
      controls.forEach(el => setExportControlLocked(el, true));
      // Un clic = un lancement (un lot entier compris) : les sites d'images déjà acceptés ne sont pas redemandés, un refus arrête tout (js/external-images.js).
      ExternalImages.beginRun();
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

  async function onExportPdf() {
    Editor.exitHeaderFooterModeIfActive();
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert(exportText('alert.noRecordForExport')); return; }
    setStatus(I18n.t('status.pdfGenerating'));
    try {
      const qualitySelect = document.getElementById('v2-pdf-quality');
      const quality = qualitySelect ? qualitySelect.value : 'native';
      const tableId = currentTableId || GristAPI.getCurrentTableId();
      const html = await currentDocumentHtml(tableId, record);
      await PdfExport.exportCurrentRecord(html, tableId, record, getPdfFilenameTemplate(), quality, Editor.getHeaderFooterData(), PageLayout.getMarginsPt());
      setStatus(I18n.t('status.pdfGenerated'));
    } catch (e) {
      // « Annuler » sur la fenêtre des images d'un site externe (js/external-images.js) : un choix, pas une erreur.
      if (ExternalImages.isCancel(e)) { setStatus(I18n.t('status.exportCancelled')); return; }
      console.error(e);
      setStatus(I18n.t('status.pdfGenerationError'), true);
    }
  }

  // Mode email (planning/feature-email-mode.md) : construit l'URL mailto: pour la ligne Grist courante et l'ouvre (même geste que les exports PDF/DOCX ci-
  // dessus/dessous - un <a> synthétique plutôt que window.location.href, dont le comportement dans l'iframe sandboxée d'un widget Grist est moins prévisible).
  // Le corps réutilise la résolution DÉJÀ FAITE par le mode Lecture (ReaderMode.render, mêmes bulles #Variable/chips que le PDF) plutôt que de la dupliquer -
  // renderReader() ne fait que mettre à jour #reader-container, jamais visible tant que currentMode reste 'edit' (cf. switchMode).
  async function onCreateEmail() {
    Editor.exitHeaderFooterModeIfActive();
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert(I18n.t('alert.noRecordForEmail')); return; }
    const tableId = currentTableId || GristAPI.getCurrentTableId();
    setStatus(I18n.t('status.emailGenerating'));
    try {
      const resolved = await resolveEmailFieldsForRecord(getEmailFieldsFromInputs(), tableId, record);
      await renderReader(record, tableId);
      const resolvedContent = readerContainer.querySelector('.reader-content');
      const bodyText = MailtoExport.plainTextFromHtml(resolvedContent ? resolvedContent.innerHTML : readerContainer.innerHTML);
      const url = MailtoExport.buildMailtoUrl({ to: resolved.destinataires, cc: resolved.cc, bcc: resolved.cci, subject: resolved.objet, bodyText });
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

  // V1 - portée volontairement plus modeste que le PDF (cf. en-tête js/docx-export.js) : pas de sélecteur de qualité, un seul mode d'export.
  async function onExportDocx() {
    Editor.exitHeaderFooterModeIfActive();
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert(I18n.t('alert.noRecordForExport')); return; }
    setStatus(I18n.t('status.docxGenerating'));
    try {
      const tableId = currentTableId || GristAPI.getCurrentTableId();
      const html = await currentDocumentHtml(tableId, record);
      await DocxExport.exportCurrentRecord(html, tableId, record, getPdfFilenameTemplate(), Editor.getHeaderFooterData(), PageLayout.getMarginsTwip());
      setStatus(I18n.t('status.docxGenerated'));
    } catch (e) {
      if (ExternalImages.isCancel(e)) { setStatus(I18n.t('status.exportCancelled')); return; }
      console.error(e);
      setStatus(I18n.t('status.docxGenerationError'), true);
    }
  }

  // Export Excel d'une grille (js/xlsx-export.js) : le tableau du modèle, enregistrement résolu, dans un classeur d'une feuille. Mêmes gestes que l'export DOCX ; sans
  // en-tête ni pied de page ni marges du document (une grille n'a pas de feuille A4 : la feuille Excel reprend l'orientation et les marges de PageLayout).
  async function onExportXlsx() {
    Editor.exitHeaderFooterModeIfActive();
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert(I18n.t('alert.noRecordForExportXlsx')); return; }
    setStatus(I18n.t('status.xlsxGenerating'));
    try {
      const tableId = currentTableId || GristAPI.getCurrentTableId();
      const html = await currentDocumentHtml(tableId, record);
      await XlsxExport.exportCurrentRecord(html, tableId, record, getPdfFilenameTemplate());
      setStatus(I18n.t('status.xlsxGenerated'));
    } catch (e) {
      if (ExternalImages.isCancel(e)) { setStatus(I18n.t('status.exportCancelled')); return; }
      console.error(e);
      setStatus(I18n.t('status.xlsxGenerationError'), true);
    }
  }

  // Dans une grille, « lignes » devient « valeurs de la table » : une ligne y est déjà une ligne de la grille (demande d'Antoine, 01/10) ; les autres types de modèle
  // gardent leurs mots. Chaque texte concerné a sa variante « …Grid » ici ; `exportText` choisit selon le type du modèle affiché.
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
    'alert.noRecordForExport': 'alert.noRecordForExportGrid',
  };
  function exportText(key, vars) {
    return I18n.t(GridEditor.isGridType(currentTypeModele) && GRID_WORDING[key] ? GRID_WORDING[key] : key, vars);
  }

  // Les exports qui n'ont de sens que pour un seul genre de modèle : Word pour un document, Excel pour une grille. La ligne de l'autre genre reste dans le menu, grisée
  // (« rien ne disparaît, on grise », demande d'Antoine du 2026-10-01) ; le clic d'une ligne grisée ne fait rien (cf. onExportRow, au câblage des boutons). Les deux lignes
  // PDF « toutes les lignes » prennent aussi les mots de la grille (`data-i18n` change, pour que le texte suive un changement de langue).
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

  // Export en lot : une ligne = un fichier, regroupés dans une archive ZIP (PDF, DOCX ou classeur Excel), ou mis bout à bout dans un seul PDF (js/pdf-merge.js : même
  // rendu par ligne que le ZIP, chaque ligne commence sur une nouvelle page) ou un seul classeur Excel (une feuille par ligne, js/xlsx-export.js). Lit toutes les
  // lignes via docApi (ignore un filtre de vue). Limité au vectoriel pour le PDF :
  // 'Impr. navigateur' ouvrirait une boîte de dialogue par ligne, et les qualités raster n'ont pas de variante "retourne un blob".
  // Ce qui change d'un export à l'autre : ses textes (clés i18n), le nom des fichiers, la fonction qui rend UNE ligne et ses marges (points pour le PDF, twips
  // pour le DOCX, aucune pour l'Excel : la feuille reprend la page du modèle) et ses bibliothèques (`loadLibs` : l'archive ZIP n'a besoin que de JSZip, ~0,1 Mo,
  // pas du lot PDF de ~4 Mo) ; tout le reste (lecture des lignes, confirmation, boucle, archive, téléchargement) est commun. `single` : pas de blob par ligne, le
  // classeur unique reçoit une feuille par ligne.
  const BATCH_EXPORTS = {
    pdfZip: {
      label: 'PDF', confirm: 'confirm.batchExport', loading: 'status.loadingPdfLibs', loadError: 'status.pdfLibsLoadError', progress: 'status.batchExportProgress',
      noFile: 'status.exportError', done: 'status.batchExportDone', doneWithFailures: 'status.batchExportDoneWithFailures',
      entryExt: '.pdf', fileSuffix: '-export-pdf.zip', margins: () => PageLayout.getMarginsPt(),
      loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await ExportCommon.ensureJsZipLoaded(); },
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins) => PdfExport.getNativePdfBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, margins),
    },
    pdfMerged: {
      label: 'PDF', confirm: 'confirm.mergedExport', loading: 'status.loadingPdfLibs', loadError: 'status.pdfLibsLoadError', progress: 'status.batchExportProgress',
      noFile: 'status.exportError', done: 'status.mergedExportDone', doneWithFailures: 'status.mergedExportDoneWithFailures',
      merged: true, fileSuffix: '-export.pdf', margins: () => PageLayout.getMarginsPt(),
      loadLibs: async () => { await PdfExport.ensurePdfLibsLoaded(); await PdfMerge.ensureLibLoaded(); },
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins) => PdfExport.getNativePdfBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, margins),
    },
    docxZip: {
      label: 'DOCX', confirm: 'confirm.batchExportDocx', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressDocx',
      noFile: 'status.exportErrorDocx', done: 'status.batchExportDoneDocx', doneWithFailures: 'status.batchExportDoneWithFailuresDocx',
      entryExt: '.docx', fileSuffix: '-export-docx.zip', margins: () => PageLayout.getMarginsTwip(),
      loadLibs: () => ExportCommon.ensureJsZipLoaded(),
      renderRow: (html, tableId, row, filenameTemplate, headerFooterData, margins) => DocxExport.getDocxBlobForRecord(html, tableId, row, filenameTemplate, headerFooterData, margins),
    },
    xlsxZip: {
      label: 'Excel', confirm: 'confirm.batchExportXlsx', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressXlsx',
      noFile: 'status.exportErrorXlsx', done: 'status.batchExportDoneXlsx', doneWithFailures: 'status.batchExportDoneWithFailuresXlsx',
      entryExt: '.xlsx', fileSuffix: '-export-xlsx.zip',
      loadLibs: async () => { await ExportCommon.ensureJsZipLoaded(); await XlsxExport.ensureExcelLibLoaded(); },
      renderRow: (html, tableId, row, filenameTemplate) => XlsxExport.getXlsxBlobForRecord(html, tableId, row, filenameTemplate),
    },
    xlsxSingle: {
      label: 'Excel', confirm: 'confirm.singleWorkbookExport', loading: 'status.loadingExportLibs', loadError: 'status.exportLibsLoadError', progress: 'status.batchExportProgressXlsx',
      noFile: 'status.exportErrorXlsx', done: 'status.singleWorkbookDone', doneWithFailures: 'status.singleWorkbookDoneWithFailures',
      single: true, fileSuffix: '-export.xlsx',
      loadLibs: () => XlsxExport.ensureExcelLibLoaded(),
    },
  };

  async function onExportBatch(kind) {
    const cfg = BATCH_EXPORTS[kind];
    const merged = !!cfg.merged;
    const single = !!cfg.single;
    Editor.exitHeaderFooterModeIfActive();
    const tableId = currentTableId || GristAPI.getCurrentTableId();
    if (!tableId) { setStatus(I18n.t('status.currentTableNotFound'), true); return; }
    let rows;
    try { rows = await GristAPI.fetchTableRows(tableId); }
    catch (e) {
      console.error('[main] export ' + cfg.label + ' en lot : échec de lecture de la table', e);
      setStatus(exportText('status.cannotReadRows'), true);
      return;
    }
    if (!rows.length) { setStatus(exportText('status.noRowsInTable', { table: tableId }), true); return; }
    const proceed = await Dialogs.confirm({ title: exportText('dialog.batchExport.title'), message: exportText(cfg.confirm, { count: rows.length, table: tableId }), confirmLabel: I18n.t('common.generate') });
    if (!proceed) return;

    // Ni JSZip ni le lot PDF ne sont chargés d'office au démarrage du widget : `JSZip` n'existe pas tant que ceci n'a pas été attendu au moins une fois.
    setStatus(I18n.t(cfg.loading));
    try {
      await cfg.loadLibs();
    } catch (e) {
      console.error('[main] export ' + cfg.label + ' en lot : échec de chargement des bibliothèques', e);
      setStatus(I18n.t(cfg.loadError), true);
      return;
    }

    // Pas de HTML unique calculé une fois pour tout le lot : pour un macro-modèle, le choix des annexes dépend des valeurs de CHAQUE ligne (cf.
    // MacroTemplates), donc la concaténation doit être refaite ligne par ligne dans la boucle ci-dessous plutôt que réutilisée telle quelle comme pour un
    // modèle normal (où le même gabarit HTML suffit pour toutes les lignes, seule sa résolution #Variable variant par ligne).
    const isMacro = currentTypeModele === 'macro';
    const html = isMacro ? null : Editor.getHTML();
    const macroSlots = isMacro ? getCurrentMacroSlots() : null;
    const templatesCache = isMacro ? Templates.getCached() : null;
    const filenameTemplate = getPdfFilenameTemplate();
    const headerFooterData = Editor.getHeaderFooterData();
    const margins = cfg.margins ? cfg.margins() : null;
    const zip = merged || single ? null : new JSZip();
    const mergedPdf = merged ? await PdfMerge.create(tableId) : null;
    const workbook = single ? await XlsxExport.createSingleWorkbook() : null;
    const usedNames = new Set();
    let ok = 0;
    let failed = 0;
    let cancelled = false;
    for (let i = 0; i < rows.length; i++) {
      setStatus(I18n.t(cfg.progress, { current: i + 1, total: rows.length }));
      try {
        const rowHtml = isMacro ? await MacroTemplates.buildConcatenatedHtml(macroSlots, tableId, rows[i], templatesCache) : html;
        if (single) {
          await workbook.appendRecord(rowHtml, tableId, rows[i], filenameTemplate);
        } else {
          const { blob, filename } = await cfg.renderRow(rowHtml, tableId, rows[i], filenameTemplate, headerFooterData, margins);
          if (merged) {
            await mergedPdf.append(blob);
          } else {
            const base = sanitizeFilenamePart(filename) || ('document-' + rows[i].id);
            zip.file(uniqueZipFilename(base, usedNames) + cfg.entryExt, blob);
          }
        }
        ok++;
      } catch (e) {
        // « Annuler » sur la fenêtre des images d'un site externe arrête tout le lot, pas seulement cette ligne : rien n'est téléchargé.
        if (ExternalImages.isCancel(e)) { cancelled = true; break; }
        console.error('[main] export ' + cfg.label + ' en lot : échec pour la ligne', rows[i].id, e);
        failed++;
      }
    }
    if (cancelled) { setStatus(I18n.t('status.exportCancelled')); return; }
    if (!ok) { setStatus(I18n.t(cfg.noFile), true); return; }

    setStatus(I18n.t(merged ? 'status.pdfMerging' : single ? 'status.xlsxAssembling' : 'status.zipCompressing'));
    const outBlob = merged ? await mergedPdf.toBlob() : single ? await workbook.toBlob() : await zip.generateAsync({ type: 'blob' });
    ExportCommon.downloadBlob(outBlob, sanitizeFilenamePart(tableId) + cfg.fileSuffix);
    setStatus(failed ? exportText(cfg.doneWithFailures, { ok, failed }) : exportText(cfg.done, { ok }));
  }

  async function switchMode(mode) {
    // Lecture seule : le mode Lecture est le seul accessible (demande d'Antoine), y compris depuis la dernière ligne d'init().
    if (isReadOnly()) mode = 'read';
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

  // Posée sur les deux conteneurs (édition et lecture), sinon la largeur réelle d'une page PDF ne s'appliquait jamais en mode Lecture. .checked sur le
  // <label> lui-même fait rester l'icône en accent/bleu tant que la case est cochée, plutôt qu'un simple texte de case à cocher. Une grille n'a pas de feuille :
  // la case est alors grisée (GridEditor.setActive) et la classe retirée, la case garde sa valeur pour le modèle suivant.
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

  // Rappelée à chaque changement de modèle (loadTemplateIntoEditor, loadMacroIntoEditor) : seul le passage d'une grille à un autre type (ou l'inverse) change la
  // classe, dans tous les autres cas la case seule la gouverne, comme avant les grilles.
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
  const MIN_FIT_ZOOM = 0.5;
  function applyPageFitZoom(container) {
    if (!container) return;
    if (!container.classList.contains('a4-preview')) { container.style.removeProperty('--pp-fit-zoom'); return; }
    // clientWidth exclut déjà la barre de défilement verticale ; le padding du conteneur, lui, encadre la feuille et doit être retiré à la main.
    const cs = getComputedStyle(container);
    const available = container.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    if (!(available > 0)) return;
    // Largeur de la feuille = celle de .v2-page-sheet / .reader-content en Aperçu A4 (--pp-page-width, css/editor-v2.css) : 793.71px en A4 portrait, 1122.52px en
    // A4 paysage, 559.37px en A5 portrait... Lue à chaque calcul, elle change avec le sens et le format du modèle.
    const raw = available / PageLayout.getSheetWidthPx();
    const zoom = raw >= 1 ? 1 : Math.max(MIN_FIT_ZOOM, raw);
    // Arrondi au millième : sans ça, un redimensionnement continu réécrit la variable à chaque pixel et relance la pagination en boucle.
    const next = String(Math.round(zoom * 1000) / 1000);
    if (container.style.getPropertyValue('--pp-fit-zoom') === next) return;
    container.style.setProperty('--pp-fit-zoom', next);
    return true;
  }

  // Pose le facteur sur les deux conteneurs SANS rafraîchir quoi que ce soit : pour les appelants qui rafraîchissent eux-mêmes juste après (chargement d'un
  // modèle, changement d'orientation). Rend true si l'un des deux a changé.
  function applyPageFitZoomToBoth() {
    const editorChanged = applyPageFitZoom(editorContainer);
    const readerChanged = applyPageFitZoom(readerContainer);
    return !!(editorChanged || readerChanged);
  }

  function refreshPageFitZoom() {
    const editorChanged = applyPageFitZoom(editorContainer);
    const readerChanged = applyPageFitZoom(readerContainer);
    // Les bandes de pagination sont positionnées à partir de mesures réelles : un changement de facteur les rend caduques tant qu'on n'a pas recalculé.
    if (editorChanged && currentMode === 'edit') Editor.refreshPaginationPreview();
    if (readerChanged && currentMode === 'read') renderReader();
  }

  // Vrai quand l'orientation ou le format a changé à un moment où l'éditeur ne pouvait pas mesurer sa mise en page - masqué (Lecture, résumé d'un macro-modèle) ou sans
  // Aperçu A4 (pas de pagination, donc pas de grille page) : la grille page des images en calque reste à recapturer (cf. onPageLayoutChanged).
  let layerGridsStale = false;
  // Recapture en attente, dès que l'éditeur peut la mesurer (retour en Édition, Aperçu A4 rallumé). Elle vient d'un geste de la personne (le changement
  // d'orientation ou de format) : si elle a modifié le document, l'enregistrement automatique la reprend - un enregistrement a pu partir entre-temps.
  function recaptureStaleLayerGrids() {
    if (!layerGridsStale || currentMode !== 'edit' || currentTypeModele === 'macro' || !editorContainer.classList.contains('a4-preview')) return;
    layerGridsStale = false;
    if (HeaderFooterPreview.recaptureLayeredImageGrids()) markAutosaveDirty();
  }
  // Après un changement d'orientation ou de format : le facteur d'ajustement (calculé sur la largeur de la page) d'abord, puis tout ce qui se mesure avec lui -
  // colonnes des tableaux et pagination de l'éditeur, repagination de la Lecture. Les marges gardent leurs millimètres : seule la page change de forme.
  function onPageLayoutChanged() {
    applyPageFitZoomToBoth();
    Editor.refreshLayout();
    // La page a changé de hauteur : la grille page de chaque image en calque (lue par le PDF et le Word) est recapturée sur le rendu réel de l'éditeur. Masqué
    // (Lecture) ou sans Aperçu A4, il n'a pas de mise en page à mesurer : la recapture attend qu'il le puisse (syncEditorVisibilityForMode, wireA4PreviewToggle).
    layerGridsStale = true;
    recaptureStaleLayerGrids();
    if (currentMode === 'read') renderReader();
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

  // Le libellé du raccourci dépend de la plateforme (⌘S sur macOS, Ctrl+S ailleurs) : impossible à écrire dans index.html, posé ici sur le titre du menu du bouton
  // Enregistrer (qui remplace son info-bulle : un bouton à menu n'a pas de data-tip, les deux se superposeraient) et sur son aria-label. Re-appliqué à chaque
  // changement de langue, sinon I18n.applyTranslations() le réécrirait sans le raccourci.
  function decorateSaveButtonShortcut() {
    const btn = document.getElementById('btn-save');
    if (!btn) return;
    const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
    const label = `${I18n.t('toolbar.save')} (${isMac ? '⌘S' : 'Ctrl+S'})`;
    btn.setAttribute('aria-label', label);
    const menuTitle = document.getElementById('v2-save-flyout-label');
    if (menuTitle) menuTitle.textContent = label;
  }

  // Les sept fenêtres écrites dans index.html sont reprises par la base commune des fenêtres (js/modal-base.js) : Tab et Échap tenus dans la fenêtre du dessus
  // où que soit le focus, focus à l'ouverture et rendu à l'élément d'origine à la fermeture. Leur module les ouvre et les ferme comme avant (style.display) ;
  // Échap clique le bouton qui les ferme (le second nom de chaque paire), donc passe par la même sortie que la souris.
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
      // Le nouveau modèle remplace l'éditeur : même question que pour un changement de modèle (« Annuler » laisse la galerie ouverte, rien n'est créé).
      if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return;
      const html = TemplateGallery.stripVariableBadges(currentHtml);
      const headerFooter = await TemplateGallery.fetchHeaderFooter(currentEntry);
      templateSelect.value = '';
      loadTemplateIntoEditor({ id: null, contenu: html, headerFooter, nom: currentEntry.name, nomFichierPDF: '' });
      await onSave();
      closeAll();
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
      setStatus(I18n.t('status.tableCreatedSummary', { table: actualTableId, count: schema.columns.length, name: savedTemplateName(currentEntry.name) }));
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
    syncSaveButtonLook();
    wireAccessLockGuard();
    try { await GristAPI.init(); } catch (e) { setStatus(I18n.t('status.gristApiError'), true); }
    // Lancé dès que les options du widget sont connues (GristAPI.init), attendu seulement avant le premier affichage, en fin d'init().
    const accessReady = AccessRights.init();
    await Editor.init();
    Comments.setReaderHooks({ save: saveReaderCommentAnchors, refresh: () => renderReader() });
    Comments.wireReader(readerContainer);
    // 'update' (pas 'transaction') : ne fire que si le DOCUMENT a réellement changé (docChanged), jamais pour un simple déplacement de curseur/sélection -
    // cf. section "Auto-save" plus haut. Couvre aussi l'édition en-tête/pied (même instance d'éditeur, contenu échangé via setContent).
    EditorCore.getEditor().on('update', markAutosaveDirty);
    EditorCore.getEditor().on('update', scheduleEmailLengthGauge);
    if (templateNameInput) templateNameInput.addEventListener('input', markAutosaveDirty);
    if (pdfFilenameInput) pdfFilenameInput.addEventListener('input', markAutosaveDirty);
    [emailSubjectInput, emailToInput, emailCcInput, emailCciInput].forEach(el => {
      if (!el) return;
      el.addEventListener('input', markAutosaveDirty);
      el.addEventListener('input', scheduleEmailLengthGauge);
      // Même mécanisme #Variable, déjà éprouvé, que le champ "nom de fichier PDF" (texte brut - cf. commentaire CSS de #v2-email-fields-row) - pas de
      // suggestion "Chips" ici (setTabsVisible(false) dans checkForFilenameTrigger), une note de bas de page/date/heure n'a aucun sens dans un objet ou une
      // liste d'adresses.
      Variables.initFilenameInput(el);
    });
    wireCciToggle();
    // Émis par js/settings.js à chaque saisie dans les 4 champs de marge (onglet Réglages) - sans lui, changer uniquement les marges sans toucher au
    // texte ne marquait jamais le brouillon "modifié" et l'auto-save ne l'enregistrait donc jamais.
    document.addEventListener('pp:marginsChanged', markAutosaveDirty);
    // Émis par PageLayout.setOrientation (bouton Portrait / Paysage) : la feuille change de largeur ET de hauteur. Le bouton ne rafraîchit rien lui-même.
    document.addEventListener('pp:pageLayoutChanged', onPageLayoutChanged);
    GristAPI.onRecord(async function (record, tableId) {
      latestRecord = record;
      latestRecordTableId = tableId || GristAPI.getCurrentTableId();
      if (tableId) currentTableId = tableId;
      if (currentMode === 'read' && record) await renderReader(record, latestRecordTableId);
      if (currentMode === 'read') await updateEmailFieldsDisplay();
      await updateEmailLengthGauge();
    });
    await refreshTemplateList();
    // Enveloppe #template-select AVANT l'écriture de templateSelect.value ci-dessous (modèle par
    // défaut) : TemplateTreeSelect intercepte cet accesseur pour se synchroniser (js/template-tree-select.js),
    // donc l'ordre importe - attaché après, ce premier affichage du modèle par défaut serait manqué.
    //
    // try/catch ajouté le 2026-09-28 (Antoine : "l'enregistrement d'un modèle ne fonctionne pas") :
    // init() n'a ailleurs aucun filet, donc une exception ici (arbre du rangement, nouveau cette
    // semaine) empêchait tout ce qui suit de se brancher - Enregistrer, Ctrl+S, l'auto-save, le statut
    // "Prêt" - sans aucun message. Cas réel trouvé et corrigé séparément (js/template-organizer.js,
    // ligne avec Nom vide/null), mais Enregistrer ne doit plus jamais dépendre du bon fonctionnement de
    // cette vue décorative : un futur bug de rendu de l'arbre reste dans l'arbre.
    // onOrganize : « Organiser mes modèles » vit dans l'en-tête du panneau depuis le 2026-10-01 (js/template-tree-select.js), plus dans la barre.
    try { TemplateTreeSelect.attach(templateSelect, { onOrganize: () => { if (!isReadOnly()) TemplateOrganizeModal.open(); } }); } catch (e) { console.error('[main] TemplateTreeSelect.attach a échoué, arbre non disponible', e); }
    // Chargement non bloquant, même patron que Comments.loadForTemplate ci-dessous : l'identification
    // utilisateur (GristAPI.getCurrentUserEmail) est un aller-retour réseau, pas de raison de retarder
    // le démarrage du widget pour la section "Épinglés" de l'arbre.
    TemplatePreferences.loadForCurrentUser()
      .then(() => TemplateTreeSelect.refresh())
      .catch(e => console.error('[main] chargement des préférences de rangement impossible', e));
    // Modèle par défaut (cf. btn-set-default-template) : sélectionné avant la lecture de templateSelect.value ci-dessous, pour que le widget s'ouvre
    // directement dessus plutôt que sur "-- Nouveau modèle --". Silencieux si l'id ne correspond à aucune option (modèle supprimé entre-temps).
    const defaultTemplateId = Templates.getDefaultId();
    if (defaultTemplateId != null) {
      const defaultTpl = Templates.getCached().find(t => String(t.id) === String(defaultTemplateId));
      // Un modèle email ou macro ne doit jamais être le modèle de démarrage (cf. syncDefaultTemplateButton,
      // qui grise désormais le bouton "modèle par défaut" pour ces deux types) - mais ce garde ne
      // "détricote" pas un défaut resté coincé sur un modèle email d'AVANT ce correctif (Antoine,
      // 2026-09-19 : le widget s'ouvrait encore sur l'email malgré le bouton grisé). On l'ignore
      // explicitement ici plutôt que de compter sur une remise à zéro manuelle.
      if (!defaultTpl || (defaultTpl.typeModele !== 'email' && defaultTpl.typeModele !== 'macro')) templateSelect.value = defaultTemplateId;
    }
    await onTemplateSelectChange();
    templateSelect.addEventListener('change', onTemplateSelectChange);
    document.getElementById('btn-new').addEventListener('click', onNew);
    const btnNewDocument = document.getElementById('v2-btn-new-document');
    const btnNewEmail = document.getElementById('v2-btn-new-email');
    const btnNewMacro = document.getElementById('v2-btn-new-macro');
    const btnNewGrid = document.getElementById('v2-btn-new-grid');
    if (btnNewDocument) btnNewDocument.addEventListener('click', onNew);
    if (btnNewEmail) btnNewEmail.addEventListener('click', onNewEmail);
    if (btnNewMacro) btnNewMacro.addEventListener('click', onNewMacro);
    if (btnNewGrid) btnNewGrid.addEventListener('click', onNewGrid);
    MacroEditor.wire(onMacroSaved, macroSettingsOnScreen);
    TemplateOrganizeModal.wire();
    document.getElementById('btn-delete').addEventListener('click', onDelete);
    document.getElementById('btn-export-pdf').addEventListener('click', withExportLock(onExportPdf));
    // Fonctions fléchées : sans elles, l'événement click arriverait comme premier argument (`merged`) et serait lu comme vrai.
    document.getElementById('v2-btn-export-pdf-batch').addEventListener('click', withExportLock(() => onExportBatch('pdfZip')));
    document.getElementById('v2-btn-export-pdf-merged').addEventListener('click', withExportLock(() => onExportBatch('pdfMerged')));
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
    wireA4PreviewToggle();
    OrientationToggle.wire({ isReadOnly });
    wireLinkRulesModal();
    wireTemplateGalleryModal();
    wireTemplateRename();
    wireDefaultTemplateButton();
    wirePdfFilenameToggle();
    wireQualityDropdown();
    Settings.wireSettingsModal();
    wirePageModals();
    wireSaveShortcut();
    wirePageFitZoom();
    decorateSaveButtonShortcut();
    I18n.onChange(decorateSaveButtonShortcut);
    // Le message « Modifications non enregistrées » dure tant que rien n'est enregistré : il suit un changement de langue au lieu de rester dans l'ancienne.
    I18n.onChange(() => { if (statusMsg.classList.contains('is-unsaved')) statusMsg.textContent = I18n.t('status.unsavedChanges'); });
    Variables.initFilenameInput(pdfFilenameInput);
    wireAutosaveConflictBanner();
    wireSaveMenu();
    startAutosaveLoop();
    await Promise.race([accessReady, new Promise(resolve => setTimeout(resolve, ACCESS_STARTUP_WAIT_MS))]);
    applyAccessRights();
    AccessRights.onChange(onAccessRightsChange);
    await switchMode('edit');
    setStatus(I18n.t(isReadOnly() ? 'status.readyReadOnly' : 'status.ready'));
  }

  // .catch() ajouté le 2026-09-28 : init() n'a de filet que sur TemplateTreeSelect.attach() (cf. commentaire
  // ci-dessus) - toute autre exception plantait l'initialisation en silence, rien dans le statut, la seule
  // trace était la console (qu'Antoine ne consulte pas). Un futur bug ailleurs dans init() s'affichera
  // maintenant ici plutôt que de reproduire "l'enregistrement ne fonctionne pas" sans aucun indice visible.
  init().catch((e) => {
    console.error('[main] init() a échoué', e);
    setStatus(I18n.t('status.initError', { message: (e && e.message) || String(e) }), true);
  });
})();
