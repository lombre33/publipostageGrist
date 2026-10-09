// Barre d'outils principale : état des boutons (enfoncé, grisé, libellés) et câblage de leurs clics. L'éditeur est posé une fois par setEditor()
// (appelé par Editor.init()) : les gestionnaires câblés une seule fois en ont besoin bien après leur mise en place.
const MainToolbar = (function () {
  let editor = null;
  function setEditor(ed) { editor = ed; }
  const byId = id => document.getElementById(id);
  let currentAlign = 'left';
  // Type du modèle courant, posé par js/main.js et relu à chaque syncToolbarState (comme le mode en-tête/pied de HeaderFooterPreview.getHfMode()).
  let inEmailMode = false;
  function setEmailMode(active) { inEmailMode = !!active; }
  // Un macro-modèle n'a aucun corps de document (l'éditeur partagé reste vide) : il grise plus de boutons qu'un e-mail.
  let inMacroMode = false;
  function setMacroMode(active) { inMacroMode = !!active; }
  // Une grille est un tableau unique, sans feuille. GRID_LOCKED_IDS liste ce qui n'y a aucun sens : grisé, jamais retiré. « Lien » reste actif (un
  // lien dans une case a un sens), le QR code aussi : il se pose sur sa case et l'Excel le dessine. Un bouton qui ouvre un autre type de bloc dans le
  // menu « Lien et blocs de contenu » s'ajoute à cette liste, sauf une image. Le saut de page n'en fait pas partie : il se pose avant la ligne
  // sélectionnée (GridEditor.togglePageBreak) et ne se grise que là où il n'a pas de sens (syncLocks).
  let inGridMode = false;
  function setGridMode(active) { inGridMode = !!active; }
  const GRID_LOCKED_IDS = [
    'v2-btn-table', 'v2-btn-two-columns', 'v2-btn-toc',
    'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature',
    'v2-btn-track-changes', 'v2-btn-accept-all', 'v2-btn-reject-all',
  ];
  const gridLockedIds = new Set();

  // Liste simple des colonnes Attachments (message « aucune colonne » et repli de la liste avec recherche) : un choix insère une image liée à la
  // #Variable, résolue en vraie image en Lecture et à l'export.
  let imageVarPickerBox = null;
  function ensureImageVarPickerBox() {
    if (imageVarPickerBox) return imageVarPickerBox;
    imageVarPickerBox = document.createElement('div');
    imageVarPickerBox.id = 'v2-image-var-picker';
    imageVarPickerBox.style.display = 'none';
    document.body.appendChild(imageVarPickerBox);
    document.addEventListener('mousedown', event => {
      if (imageVarPickerBox.style.display !== 'none' && !imageVarPickerBox.contains(event.target)) {
        imageVarPickerBox.style.display = 'none';
      }
    });
    return imageVarPickerBox;
  }
  const insertVariableImage = v => editor.chain().focus().insertImage({ varTable: v.table, varColumn: v.column, varKey: v.key, width: '320px', height: '240px' }).run();
  // Liste avec recherche (js/search-select.js), comme chaque choix de colonne de l'interface : elle s'ouvre à côté de la ligne « Image depuis une
  // variable ». Un <select> caché, dans un conteneur à part, porte les colonnes et reçoit `change` au choix : l'insertion se fait là.
  let imageVarSearch = null;
  function closeImageVariableSearch(instance) {
    if (!imageVarSearch || (instance && instance !== imageVarSearch)) return;
    const { host, search } = imageVarSearch;
    imageVarSearch = null;
    try { search.destroy(); } catch (e) { /* déjà défait */ }
    host.remove();
  }
  // Rectangle de la ligne du menu Image ; si ce menu s'est refermé (ligne en display:none, rectangle nul), celui du bouton Image, pas le coin
  // haut-gauche de la fenêtre.
  function anchorRectOf(anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    return rect.width || rect.height ? rect : byId('v2-btn-image').getBoundingClientRect();
  }
  // Faux si le composant est indisponible (fichier introuvable, erreur) : l'appelant garde la liste simple.
  function openImageVariableSearch(candidates, anchorEl) {
    let host = null;
    let instance = null;
    try {
      closeImageVariableSearch();
      host = document.createElement('div');
      host.id = 'v2-image-var-search';
      const select = document.createElement('select');
      candidates.forEach(v => {
        const option = document.createElement('option');
        option.value = v.key;
        option.textContent = v.key;
        option.dataset.search = Variables.columnSearchText(v.table, v.column);
        select.appendChild(option);
      });
      host.appendChild(select);
      document.body.appendChild(host);
      select.selectedIndex = -1; // rien de choisi au départ : même la première ligne déclenche `change`
      const search = SearchSelect.attachColumns(select, {
        popup: true,
        anchor: () => anchorRectOf(anchorEl),
        // Défait après l'évènement en cours : un blur ou un clic qui ferme le panneau ne doit pas retirer l'élément qui le porte. Le focus revient à
        // l'éditeur après Échap ou un choix, pas après un clic ailleurs.
        onClose: refocus => { if (refocus) editor.commands.focus(); setTimeout(() => closeImageVariableSearch(instance), 0); },
      });
      instance = { host, search };
      imageVarSearch = instance;
      select.addEventListener('change', () => {
        const v = candidates.find(c => c.key === select.value);
        if (v) insertVariableImage(v);
      });
      search.open();
      return true;
    } catch (e) {
      console.warn('[MainToolbar] recherche de colonne indisponible, liste simple conservée', e);
      if (instance) closeImageVariableSearch(instance); else if (host) host.remove();
      return false;
    }
  }
  async function openImageVariablePicker(anchorEl) {
    await GristAPI.refreshSchema().catch(() => {});
    // Colonnes de la table de la page en tête (celles de la table parcourue par la zone répétée où est le curseur avant elles), comme la liste « # ».
    const candidates = Variables.prioritizeTables(
      GristAPI.getAllVariables().filter(v => GristAPI.getColumnType(v.table, v.column) === 'Attachments'), Variables.currentTables(editor));
    // Liste avec recherche d'abord ; la liste simple sert au message « aucune colonne » et quand le composant est indisponible.
    if (candidates.length) {
      if (imageVarPickerBox) imageVarPickerBox.style.display = 'none';
      if (openImageVariableSearch(candidates, anchorEl)) return;
    }
    const box = ensureImageVarPickerBox();
    box.innerHTML = '';
    if (!candidates.length) {
      const empty = document.createElement('div');
      empty.className = 'v2-image-var-picker-empty';
      empty.textContent = I18n.t('imageVarPicker.empty');
      box.appendChild(empty);
    } else {
      candidates.forEach(v => {
        const item = document.createElement('div');
        item.className = 'v2-image-var-picker-item';
        item.textContent = v.key;
        // mousedown et preventDefault, pas click : le blur de l'éditeur déclenché par ce clic perturberait la sélection avant insertImage (même
        // précaution que ac-item, js/variables.js:render).
        item.addEventListener('mousedown', event => {
          event.preventDefault();
          insertVariableImage(v);
          box.style.display = 'none';
        });
        box.appendChild(item);
      });
    }
    // Placé une fois affiché, pour rester dans la fenêtre (ViewportFit.placePopup).
    const rect = anchorRectOf(anchorEl);
    box.style.display = 'block';
    ViewportFit.placePopup(box, rect, { gap: 4 });
  }
  // Image insérée par URL : convertie en data URI avant insertion (même fetch que js/pdf-export.js:inlineEditorImagesAsDataUri, avancé à l'import),
  // pour que l'URL externe ne soit pas stockée dans le modèle. Si la conversion échoue (CORS, réseau), l'URL brute reste : l'image s'affiche dans
  // l'éditeur et en Lecture, seul l'export PDF/DOCX peut échouer à l'inclure, avec l'avertissement.
  async function urlToDataUriOrWarn(src) {
    if (!src || src.startsWith('data:')) return src;
    try {
      return await ImageIo.toDataUri(await ImageIo.fetchBlob(src));
    } catch (e) {
      console.warn('[Editor] image par URL non convertible en data URI (CORS/réseau), URL brute conservée :', src, e);
      window.alert(I18n.t('image.corsWarning'));
      // La personne vient de taper cette adresse et de demander à la copier : le site n'a rien à apprendre d'un affichage de plus, l'image s'affiche
      // (js/external-images.js ; à la prochaine ouverture du modèle, elle attendra un clic « Afficher »).
      ExternalImages.allow(ExternalImages.siteOf(src));
      return src;
    }
  }
  // L'adresse d'une image d'un autre site (ExternalImages.siteOf) se choisit une fois, à l'insertion (contrôle de sécurité) : « Intégrer l'image »
  // (par défaut) la copie dans le modèle, « Garder le lien » garde l'adresse - elle se charge alors depuis ce site (après un clic « Afficher » à chaque
  // ouverture du modèle) et reste signalée en rouge (js/external-images.js). Une adresse data: ou du même site que le widget n'envoie personne ailleurs : elle est intégrée sans
  // question. Renvoie null quand la question est annulée (Annuler, Échap) : rien ne s'insère.
  async function imageSourceFromUrl(url) {
    const site = ExternalImages.siteOf(url);
    if (!site) return urlToDataUriOrWarn(url);
    const choice = await Dialogs.choose({
      title: I18n.t('dialog.imageExternal.title'),
      message: I18n.t('dialog.imageExternal.message', { site }),
      choices: [
        { value: 'keep', label: I18n.t('dialog.imageExternal.keep') },
        { value: 'embed', label: I18n.t('dialog.imageExternal.embed'), primary: true },
      ],
    });
    // « Garder le lien » est l'accord de la personne pour ce site : l'image s'affiche tout de suite. À la prochaine ouverture du modèle, elle attendra
    // un clic « Afficher » comme toute image d'un autre site.
    if (choice === 'keep') { ExternalImages.allow(site); return url; }
    return choice === 'embed' ? urlToDataUriOrWarn(url) : null;
  }
  function applyToolbarIcons() {
    const set = (id, icon) => { const el = byId(id); if (el) el.innerHTML = Icons.svg(icon); };
    set('v2-btn-bold', 'bold'); set('v2-btn-italic', 'italic');
    set('v2-btn-underline', 'underline'); set('v2-btn-strike', 'strike');
    set('v2-btn-align-left', 'alignLeft'); set('v2-btn-align-center', 'alignCenter');
    set('v2-btn-align-right', 'alignRight'); set('v2-btn-align-justify', 'alignJustify');
    // Icône initiale de v2-btn-align-main, resynchronisée dès le premier syncToolbarState sur l'alignement du curseur.
    set('v2-btn-align-main', 'alignLeft');
    set('v2-btn-bullet', 'bulletList');
    set('v2-btn-bullet-disc', 'bulletDisc'); set('v2-btn-bullet-circle', 'bulletCircle'); set('v2-btn-bullet-square', 'bulletSquare');
    set('v2-btn-ordered-numeric', 'orderedList'); set('v2-btn-ordered-alpha', 'orderedAlpha'); set('v2-btn-ordered-roman', 'orderedRoman');
    set('v2-btn-checklist-accent-strike', 'checklistAccentStrike');
    set('v2-btn-checklist-classic', 'checklistClassic');
    set('v2-btn-checklist-accent-plain', 'checklistAccentPlain');
    set('v2-btn-outdent', 'outdent'); set('v2-btn-indent', 'indent');
    set('v2-btn-table', 'table');
    set('v2-btn-two-columns', 'twoColumns'); set('v2-btn-image', 'image');
    set('v2-btn-page-break', 'pageBreak'); set('v2-btn-toc', 'toc');
    set('v2-btn-comment', 'comment');
    // Menu « Lien et blocs de contenu » (js/link-dialog.js, js/callout.js, js/qr-code.js, js/chart-block.js) : le bouton porte l'icône du lien, chaque ligne la
    // sienne.
    set('v2-btn-link', 'link');
    const setRowIcon = (id, icon) => { const slot = document.querySelector('#' + id + ' .v2-menu-row-icon'); if (slot) slot.innerHTML = Icons.svg(icon); };
    setRowIcon('v2-row-link', 'link'); setRowIcon('v2-btn-citation', 'blockquote'); setRowIcon('v2-btn-code-block', 'codeBlock');
    setRowIcon('v2-btn-callout', 'callout'); setRowIcon('v2-btn-signature', 'signature'); setRowIcon('v2-btn-qr', 'qr'); setRowIcon('v2-btn-chart', 'chart');
    set('v2-btn-insert-variable', 'variable');
    set('v2-btn-undo', 'undo'); set('v2-btn-redo', 'redo');
    set('v2-btn-find', 'search');
    set('v2-btn-track-changes', 'trackChanges');
    set('v2-btn-accept-all', 'acceptAll'); set('v2-btn-reject-all', 'rejectAll');
    set('v2-highlight-icon', 'highlight');
    set('v2-btn-format-painter', 'formatPainter');
    set('v2-color-text-caret', 'caretDown'); set('v2-color-highlight-caret', 'caretDown');
    set('v2-font-chip-caret', 'caretDown');
  }

  const setActive = (id, on) => { const el = byId(id); if (el) el.classList.toggle('is-active', !!on); };
  const setDisabled = (id, off) => { const el = byId(id); if (el) el.disabled = !!off; };
  const MARK_BUTTONS = { 'v2-btn-bold': 'bold', 'v2-btn-italic': 'italic', 'v2-btn-underline': 'underline', 'v2-btn-strike': 'strike' };
  const ALIGNMENTS = ['left', 'center', 'right', 'justify'];
  // Pour chaque liste : l'attribut qui porte son style, le style par défaut (sans attribut), la commande qui la pose et le bouton de chaque style.
  // Dans la liste du curseur, le bouton de son style est enfoncé.
  const LIST_STYLES = {
    bulletList: {
      attr: 'bulletStyle', fallback: 'disc', command: 'toggleBulletList',
      buttons: { 'v2-btn-bullet-disc': 'disc', 'v2-btn-bullet-circle': 'circle', 'v2-btn-bullet-square': 'square' },
    },
    orderedList: {
      attr: 'numberStyle', fallback: 'decimal', command: 'toggleOrderedList',
      buttons: { 'v2-btn-ordered-numeric': 'decimal', 'v2-btn-ordered-alpha': 'alpha', 'v2-btn-ordered-roman': 'roman' },
    },
    taskList: {
      attr: 'taskListStyle', fallback: 'accentStrike', command: 'toggleTaskList',
      buttons: { 'v2-btn-checklist-accent-strike': 'accentStrike', 'v2-btn-checklist-classic': 'classic', 'v2-btn-checklist-accent-plain': 'accentPlain' },
    },
  };

  // État des boutons (enfoncé, grisé, libellés), recalculé à chaque sélection et transaction, pas seulement au clic : il reste juste au clavier
  // aussi.
  function syncToolbarState() {
    syncTextButtons();
    syncBlockButtons();
    syncPageBreakButton();
    syncGridLocks(syncLocks());
    syncHeadingChip();
    syncTextStyleChips();
  }

  function syncTextButtons() {
    Object.entries(MARK_BUTTONS).forEach(([id, mark]) => setActive(id, editor.isActive(mark)));
    const aligned = ALIGNMENTS.filter(a => editor.isActive({ textAlign: a }));
    ALIGNMENTS.forEach(a => setActive('v2-btn-align-' + a, aligned.includes(a)));
    // Le bouton principal du groupe « Alignement » montre l'alignement du curseur ; son clic le réapplique (currentAlign).
    currentAlign = aligned[0] || 'left';
    const alignMain = byId('v2-btn-align-main');
    if (alignMain) alignMain.innerHTML = Icons.svg('align' + currentAlign[0].toUpperCase() + currentAlign.slice(1));
    // Le bouton « Liste » est enfoncé dès qu'un des trois types de liste l'est.
    setActive('v2-btn-bullet', Object.keys(LIST_STYLES).some(list => editor.isActive(list)));
    Object.entries(LIST_STYLES).forEach(([list, { attr, fallback, buttons }]) => {
      const style = editor.isActive(list) ? editor.getAttributes(list)[attr] || fallback : null;
      Object.entries(buttons).forEach(([id, name]) => setActive(id, style === name));
    });
  }

  function syncBlockButtons() {
    // Sur une sélection de cases, `can()` est toujours faux (son début est avant la liste, pas dedans) : on grise d'après les listes que les cases
    // contiennent.
    const cellsSelected = EditorCore.isCellSelection(editor.state.selection);
    setDisabled('v2-btn-indent', cellsSelected ? !EditorCore.canShiftListsInSelectedCells('in') : !editor.can().sinkListItem('listItem'));
    setDisabled('v2-btn-outdent', cellsSelected ? !EditorCore.canShiftListsInSelectedCells('out') : !editor.can().liftListItem('listItem'));
    setActive('v2-btn-citation', EditorCore.isQuoteActive());
    setActive('v2-btn-code-block', editor.isActive('codeBlock'));
    const inLink = editor.isActive('link');
    setActive('v2-btn-link', inLink);
    setActive('v2-row-link', inLink);
    // Dans un encadré, la ligne « Encadré… » devient « Modifier l'encadré… » (la même fenêtre change sa couleur et son icône, ou le retire).
    const inCallout = Callout.isInside(editor);
    setActive('v2-btn-callout', inCallout);
    relabelCallout(inCallout);
    // Un QR code sélectionné : la ligne « QR code… » du menu devient « Modifier le QR code… » (la même fenêtre change son texte).
    const qrSelected = QrCode.isSelected(editor);
    setActive('v2-btn-qr', qrSelected);
    relabelQr(qrSelected);
    // Un graphique de la page sélectionné : la ligne « Graphique de la page… » devient « Modifier le graphique… » (la même fenêtre change de graphique ou de lignes).
    const chartSelected = ChartBlock.isSelected(editor);
    setActive('v2-btn-chart', chartSelected);
    relabelChart(chartSelected);
    // Suivi des modifications : le bouton bascule reste actionnable ; accepter et refuser tout se grisent sans modification en attente, recalculés à
    // chaque transaction (accepter ou refuser une suggestion, bascule du mode).
    setActive('v2-btn-track-changes', Editor.isTrackChangesOn());
    const hasPending = Editor.hasPendingTrackedChanges();
    setDisabled('v2-btn-accept-all', !hasPending);
    setDisabled('v2-btn-reject-all', !hasPending);
    // « Garder avec le suivant » (menu Alignement) : cochée quand les paragraphes visés le portent, grisée avec sa raison hors du texte courant.
    KeepWithNext.syncRow(byId('v2-btn-keep-next'), editor);
  }

  // Boutons grisés (classe v2-hf-locked, jamais retirés) selon le mode et la sélection, une seule condition par bouton. Renvoie les ids grisés.
  function syncLocks() {
    const mailOrMacro = inEmailMode || inMacroMode;
    const inHfMode = !!HeaderFooterPreview.getHfMode();
    const groups = [
      // E-mail ou macro-modèle : on grise la mise en forme qui n'a aucun sens dans un mailto: (texte brut, js/mailto-export.js) ou sans corps de
      // document. Les groupes à survol (titres, alignement, image) le sont en entier : pointer-events s'hérite (.v2-hf-locked, css/toolbar-v2.css),
      // ce qui bloque aussi leur volet déroulant. Un niveau de titre n'est qu'une taille et un poids, que le texte brut ne porte pas.
      [mailOrMacro, ['v2-btn-bold', 'v2-btn-italic', 'v2-btn-underline', 'v2-btn-strike', 'v2-heading-group', 'v2-align-group', 'v2-size-stepper', 'v2-font-chip',
        'v2-text-color-split', 'v2-highlight-split', 'v2-btn-format-painter', 'v2-btn-table', 'v2-btn-two-columns', 'v2-image-group', 'v2-btn-toc']],
      // Dans une grille, le bouton pose ou retire le saut avant la ligne sélectionnée : grisé sur la première ligne et au milieu d'une case fusionnée
      // sur plusieurs lignes.
      [mailOrMacro || (inGridMode && !GridEditor.canTogglePageBreak(editor)), ['v2-btn-page-break']],
      // Un macro-modèle grise aussi ce que l'e-mail laisse actif, et le menu « Lien et blocs de contenu » en entier.
      [inMacroMode, ['v2-btn-comment', 'v2-btn-insert-variable', 'v2-btn-undo', 'v2-btn-redo', 'v2-btn-find', 'v2-btn-track-changes',
        'v2-blocks-group', 'v2-btn-accept-all', 'v2-btn-reject-all']],
      // En-tête ou pied de page : un niveau de titre a un sens, pas la numérotation (titres du flux principal seul).
      [inHfMode, ['v2-numbering-seg']],
      // Deux lignes du menu « Lien et blocs de contenu » se grisent selon la sélection : pas de lien dans un bloc de code ni sur une image seule, pas
      // de bloc de code qui effacerait une variable ou une image.
      [!LinkDialog.canLinkHere(editor), ['v2-btn-link', 'v2-row-link']],
      [!editor.isActive('codeBlock') && codeBlockWouldDropContent(), ['v2-btn-code-block']],
      // Encadré et signature (une zone 2 colonnes) : sans objet dans un e-mail (texte brut) ni dans un en-tête ou un pied de page. QR code et graphique de
      // la page : des images, donc pas dans un e-mail, ni dans un en-tête ou un pied de page tant que la Lecture n'y résout pas les colonnes
      // (ReaderMode.resolveHeaderFooterZone). Dans une grille la ligne reste active : l'image se pose sur sa case, résolue par ReaderMode.preview
      // comme à la Lecture.
      [inEmailMode || inHfMode, ['v2-btn-callout', 'v2-btn-signature', 'v2-btn-qr', 'v2-btn-chart']],
    ];
    const lockedNow = new Set();
    groups.forEach(([locked, ids]) => ids.forEach(id => {
      const el = byId(id);
      if (!el) return;
      el.classList.toggle('v2-hf-locked', !!locked);
      if (locked) lockedNow.add(id);
    }));
    return lockedNow;
  }

  // Dans une grille, le bouton « Saut de page » est enfoncé sur une ligne qui porte un saut et son libellé le dit (autre texte, même icône). Les clés
  // i18n suivent le mode : I18n.applyTranslations les relit au changement de langue.
  function syncPageBreakButton() {
    const button = byId('v2-btn-page-break');
    if (!button) return;
    const keys = inGridMode ? ['insert.pageBreak.gridTip', 'insert.pageBreak.gridAria'] : ['insert.pageBreak.tip', 'insert.pageBreak.aria'];
    if (button.getAttribute('data-i18n-tip') !== keys[0]) {
      button.setAttribute('data-i18n-tip', keys[0]); button.setAttribute('data-i18n-aria', keys[1]);
      button.setAttribute('data-tip', I18n.t(keys[0])); button.setAttribute('aria-label', I18n.t(keys[1]));
    }
    const onBreak = inGridMode && GridEditor.hasPageBreak(editor);
    setActive('v2-btn-page-break', onBreak);
    if (inGridMode) button.setAttribute('aria-pressed', onBreak ? 'true' : 'false'); else button.removeAttribute('aria-pressed');
  }

  // Mode grille, appliqué après syncLocks : le dernier appel gagne. En quittant la grille, un bouton que syncLocks gère vient d'être recalculé par
  // elle : s'il reste grisé (encadré et signature en e-mail ou en-tête), on n'y touche pas ; seul un bouton qu'elle ne gère pas (la citation) est
  // dégrisé ici.
  function syncGridLocks(lockedNow) {
    GRID_LOCKED_IDS.forEach(id => {
      const el = byId(id);
      if (!el) return;
      if (inGridMode) { el.classList.add('v2-hf-locked'); gridLockedIds.add(id); }
      else if (gridLockedIds.delete(id) && !lockedNow.has(id)) el.classList.remove('v2-hf-locked');
    });
  }

  function syncHeadingChip() {
    const headerSelect = byId('v2-header-select');
    if (!headerSelect) return;
    const level = [6, 5, 4, 3, 2, 1].find(l => editor.isActive('heading', { level: l }));
    const value = level ? String(level) : 'p';
    if (headerSelect.value !== value) headerSelect.value = value;
    const chipVal = byId('v2-heading-chip-val');
    if (chipVal) chipVal.textContent = value === 'p' ? 'Normal' : 'Titre ' + value;
    const headingFlyout = byId('v2-heading-flyout');
    if (headingFlyout) headingFlyout.querySelectorAll('.v2-hover-row[data-level]').forEach(row => row.classList.toggle('is-active', row.dataset.level === value));
  }

  function syncTextStyleChips() {
    const textStyleAttrs = editor.getAttributes('textStyle');
    EditorCore.setColorIcon('v2-text-color-icon', textStyleAttrs.color || null);
    EditorCore.setColorIcon('v2-highlight-icon', textStyleAttrs.backgroundColor || null);
    // Sans marque explicite, la police et la taille réellement rendues (Roboto, 10.5pt : .tiptap dans css/editor-v2.css), plutôt qu'un champ vide.
    setChipText('v2-font-chip-val', textStyleAttrs.fontFamily || 'Roboto');
    setChipText('v2-size-chip-val', textStyleAttrs.fontSize || '10.5pt');
  }
  function setChipText(id, value) {
    const chip = byId(id);
    if (chip && chip.textContent !== value) chip.textContent = value;
  }
  // Un bloc de code est du texte brut, sans marque ni bulle. Y convertir un paragraphe qui porte une variable, une pastille ou une image l'effacerait
  // en silence (ProseMirror retire ce que le nouveau type n'accepte pas) : la ligne se grise alors (syncLocks). Gras, couleur ou lien sont simplement
  // perdus, comme dans tout bloc de code.
  function codeBlockWouldDropContent() {
    const { doc, selection } = editor.state;
    let drops = false;
    doc.nodesBetween(selection.from, selection.to, node => {
      if (drops) return false;
      if (!node.isTextblock) return true;
      node.forEach(child => { if (child.isInline && !child.isText && child.type.name !== 'hardBreak') drops = true; });
      return false;
    });
    return drops;
  }
  // Plusieurs paragraphes sélectionnés, côte à côte et sans rien d'autre entre eux, deviennent un seul bloc de code, une ligne par paragraphe (la
  // commande de TipTap en ferait un bloc par paragraphe, empilés avec leurs marges). Renvoie vrai si c'est fait ; faux laisse la main à la commande
  // de TipTap (curseur seul, un paragraphe, liste ou tableau).
  function mergeSelectionIntoCodeBlock() {
    const { doc, selection, schema } = editor.state;
    const blocks = [];
    doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (!node.isTextblock) return true;
      blocks.push({ node, pos });
      return false;
    });
    if (blocks.length < 2 || codeBlockWouldDropContent()) return false;
    const parent = doc.resolve(blocks[0].pos).parent;
    const sideBySide = blocks.every((b, i) => doc.resolve(b.pos).parent === parent && (i === 0 || blocks[i - 1].pos + blocks[i - 1].node.nodeSize === b.pos));
    if (!sideBySide) return false;
    const text = blocks.map(b => b.node.textBetween(0, b.node.content.size, '\n', '\n')).join('\n');
    const start = blocks[0].pos;
    const end = blocks[blocks.length - 1].pos + blocks[blocks.length - 1].node.nodeSize;
    const TextSelection = EditorCore.getTextSelectionClass();
    return editor.chain().focus().command(({ tr }) => {
      tr.replaceWith(start, end, schema.nodes.codeBlock.create(null, text ? schema.text(text) : null));
      tr.setSelection(TextSelection.near(tr.doc.resolve(start + 1 + text.length)));
      return true;
    }).run();
  }
  function toggleCodeBlock() {
    // La ligne grisée ne se clique pas à la souris, mais le clavier (Tab, Entrée) et les .click() d'autres modules l'atteignent : le refus vit aussi
    // ici.
    if (!editor.isActive('codeBlock') && codeBlockWouldDropContent()) return;
    if (!editor.isActive('codeBlock') && mergeSelectionIntoCodeBlock()) return;
    editor.chain().focus().toggleCodeBlock().run();
  }
  // Ligne « Encadré… » : « Modifier l'encadré… » quand le curseur est dans un encadré. Réécrite à chaque changement d'état et de langue (data-i18n ne
  // porte que la version « insérer »).
  function relabelCallout(inside) {
    const label = byId('v2-btn-callout-label');
    if (label) label.textContent = I18n.t(inside ? 'insert.callout.rowEdit' : 'insert.callout.row');
  }
  // Ligne « QR code… » : « Modifier le QR code… » quand un QR code est sélectionné. Réécrite à chaque changement d'état et de langue.
  function relabelQr(selected) {
    const label = byId('v2-btn-qr-label');
    if (label) label.textContent = I18n.t(selected ? 'insert.qr.rowEdit' : 'insert.qr.row');
    // Le nom accessible porte le même verbe que le libellé (« Modifier » ou « Insérer ») ; data-i18n-aria le garde juste au changement de langue.
    const row = byId('v2-btn-qr');
    if (row) {
      const key = selected ? 'insert.qr.ariaEdit' : 'insert.qr.aria';
      row.setAttribute('data-i18n-aria', key);
      row.setAttribute('aria-label', I18n.t(key));
    }
  }
  // Ligne « Graphique de la page… » : « Modifier le graphique… » quand un graphique est sélectionné, comme « QR code… » ci-dessus.
  function relabelChart(selected) {
    const label = byId('v2-btn-chart-label');
    if (label) label.textContent = I18n.t(selected ? 'insert.chart.rowEdit' : 'insert.chart.row');
    const row = byId('v2-btn-chart');
    if (row) {
      const key = selected ? 'insert.chart.ariaEdit' : 'insert.chart.aria';
      row.setAttribute('data-i18n-aria', key);
      row.setAttribute('aria-label', I18n.t(key));
    }
  }
  // La touche de la loupe (Ctrl+F, ⌘F, ou celle choisie dans Réglages > Raccourcis, js/shortcuts.js) est posée sur l'infobulle et l'aria-label,
  // réécrits à chaque changement de langue ou de touche ; sans touche, pas de parenthèses.
  function decorateFindShortcut() {
    const button = byId('v2-btn-find');
    if (!button) return;
    const label = Shortcuts.label('find');
    const suffix = label ? ' (' + label + ')' : '';
    button.setAttribute('data-tip', I18n.t('find.tip') + suffix);
    button.setAttribute('aria-label', I18n.t('find.button.aria') + suffix);
  }
  // Le raccourci du lien dépend de la plateforme (Ctrl+K ou ⌘K) : posé sur l'aria-label du bouton et dans la ligne « Lien… » du menu, réécrit à
  // chaque changement de langue (applyTranslations remet sinon l'aria-label sans lui), comme decorateSaveButtonShortcut dans js/main.js.
  function decorateLinkShortcut() {
    const label = LinkDialog.shortcutLabel();
    const button = byId('v2-btn-link');
    if (button) button.setAttribute('aria-label', I18n.t('insert.link.aria') + (label ? ' (' + label + ')' : ''));
    const kbd = byId('v2-row-link-kbd');
    if (kbd) kbd.textContent = label;
  }
  // Chaque bouton appelle directement une commande TipTap sur la sélection réelle, sans avoir à savoir si elle est dans une case ou une colonne.
  function wireToolbar() {
    applyToolbarIcons();
    const bind = (id, fn) => { const el = byId(id); if (el) el.addEventListener('click', fn); };
    bind('v2-btn-bold', () => editor.chain().focus().toggleBold().run());
    bind('v2-btn-italic', () => editor.chain().focus().toggleItalic().run());
    bind('v2-btn-underline', () => editor.chain().focus().toggleUnderline().run());
    bind('v2-btn-strike', () => editor.chain().focus().toggleStrike().run());
    ALIGNMENTS.forEach(align => bind('v2-btn-align-' + align, () => editor.chain().focus().setTextAlign(align).run()));
    // Le bouton principal réapplique l'alignement qu'il montre (currentAlign, tenu à jour par syncToolbarState) ; les quatre boutons ci-dessus sont
    // dans le panneau révélé au survol (.v2-hover-flyout, index.html).
    bind('v2-btn-align-main', () => editor.chain().focus().setTextAlign(currentAlign).run());
    // « Garder avec le suivant » (js/keep-with-next.js) : ligne à cocher du même panneau, au clic comme au clavier (Entrée, Espace). Sans effet quand
    // le groupe est grisé (e-mail, macro-modèle, lecture seule, Lecture) : son `tabindex` laisse y arriver au clavier.
    const keepNextRow = byId('v2-btn-keep-next');
    if (keepNextRow) {
      const toggleKeepNext = () => { if (!keepNextRow.closest('.v2-hf-locked, .pp-access-locked')) KeepWithNext.run(editor); };
      keepNextRow.addEventListener('mousedown', event => event.preventDefault());
      keepNextRow.addEventListener('click', toggleKeepNext);
      keepNextRow.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleKeepNext();
      });
      I18n.onChange(() => KeepWithNext.syncRow(keepNextRow, editor));
    }
    // Une liste se pose dans toutes les cases d'une sélection de cases, ou s'en retire (EditorCore.toggleList, aussi derrière Ctrl+Maj+8 et
    // Ctrl+Maj+7, js/shortcuts.js).
    bind('v2-btn-bullet', () => EditorCore.toggleList('bulletList', 'toggleBulletList'));
    // Style d'une liste : la crée si le curseur n'y est pas (dans chaque case d'une sélection de cases), sinon change seulement le style de la liste
    // existante.
    const applyListStyle = (name, command, attrs) => EditorCore.runOnSelectedCells(
      () => {
        const chain = editor.chain().focus();
        if (!editor.isActive(name)) chain[command]();
        chain.updateAttributes(name, attrs).run();
      },
      chain => chain
        .command(({ state, commands }) => { if (!EditorCore.isInsideNode(state.selection.$from, name)) commands[command](); return true; })
        .updateAttributes(name, attrs));
    // Un bouton par style, révélés au survol du bouton « Liste à puces » (table LIST_STYLES).
    Object.entries(LIST_STYLES).forEach(([list, { attr, command, buttons }]) =>
      Object.entries(buttons).forEach(([id, style]) => bind(id, () => applyListStyle(list, command, { [attr]: style }))));
    // Hors d'une liste, la commande ne fait rien sans erreur : le bouton se grise (syncBlockButtons) au lieu de disparaître. Sur une sélection de
    // cases, chaque liste des cases se décale (EditorCore.shiftListsInSelectedCells : les commandes ne regardent que la case de tête et se grisent) ;
    // le premier élément d'une liste ne se décale pas, comme dans une case seule.
    bind('v2-btn-outdent', () => { if (!EditorCore.shiftListsInSelectedCells('out')) editor.chain().focus().liftListItem('listItem').run(); });
    bind('v2-btn-indent', () => { if (!EditorCore.shiftListsInSelectedCells('in')) editor.chain().focus().sinkListItem('listItem').run(); });
    bind('v2-btn-table', () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run());
    bind('v2-btn-two-columns', () => editor.chain().focus().insertTwoColumns().run());
    bind('v2-btn-image', async () => {
      // Espaces autour d'une adresse collée retirés : ni dans la question, ni dans l'adresse gardée ; une saisie d'espaces seuls vaut une saisie
      // vide.
      const url = ((await Dialogs.prompt({ title: I18n.t('dialog.imageUrl.title'), label: I18n.t('image.urlPrompt'), confirmLabel: I18n.t('common.insert') })) || '').trim();
      if (!url) return;
      const src = await imageSourceFromUrl(url);
      if (src !== null) await Editor.insertImageAtDefaultSize(src);
    });
    bind('v2-btn-image-from-variable', () => openImageVariablePicker(byId('v2-btn-image-from-variable')));
    // Une grille n'a pas de page : le bouton y pose le saut de la ligne (le PDF y commence une page, l'Excel une feuille) ; un second clic le retire.
    bind('v2-btn-page-break', () => {
      if (GridEditor.isActive()) { GridEditor.togglePageBreak(editor); editor.chain().focus().run(); return; }
      editor.chain().focus().insertPageBreak().run();
    });
    bind('v2-btn-toc', () => editor.chain().focus().insertToc().run());
    bind('v2-btn-comment', () => Comments.insertCommentAtSelection());
    // Une icône pour trois fonctions (js/link-dialog.js) : le bouton et sa première ligne ouvrent la fenêtre du lien, les deux autres lignes mettent
    // en forme.
    bind('v2-btn-link', () => LinkDialog.open());
    bind('v2-row-link', () => LinkDialog.open());
    // Nœud blockquote de StarterKit, déjà géré en PDF, DOCX et Lecture. Sur une sélection de cases, toutes les cases entrent dans une citation ou en
    // sortent : l'état voulu est l'inverse de celui que le bouton montre (la case de tête), comme pour les listes.
    bind('v2-btn-citation', () => { if (!EditorCore.quoteSelectedCells(!EditorCore.isQuoteActive())) editor.chain().focus().toggleBlockquote().run(); });
    bind('v2-btn-code-block', toggleCodeBlock);
    // Encadré : une fenêtre (couleur, icône) pour l'insérer autour de la sélection ou, dans un encadré, le modifier ; signature : un morceau de
    // document tout fait.
    bind('v2-btn-callout', () => Callout.open());
    bind('v2-btn-signature', () => Callout.insertSignature(editor));
    // QR code : une fenêtre (adresse ou texte, colonnes comprises) pour l'insérer ou, quand il est sélectionné, le modifier.
    bind('v2-btn-qr', () => QrCode.open());
    // Graphique de la page : une fenêtre (quel graphique de Grist, quelles lignes) pour l'insérer ou, quand il est sélectionné, le changer.
    bind('v2-btn-chart', () => ChartBlock.open());
    decorateLinkShortcut();
    I18n.onChange(decorateLinkShortcut);
    Shortcuts.onChange(decorateLinkShortcut);
    decorateFindShortcut();
    I18n.onChange(decorateFindShortcut);
    Shortcuts.onChange(decorateFindShortcut);
    bind('v2-btn-find', () => FindReplace.toggle());
    I18n.onChange(() => relabelCallout(Callout.isInside(editor)));
    I18n.onChange(() => relabelQr(QrCode.isSelected(editor)));
    I18n.onChange(() => relabelChart(ChartBlock.isSelected(editor)));
    // On insère seulement le caractère déclencheur : @tiptap/suggestion (Variables.createExtension) surveille le document, pas les frappes, donc le
    // caractère inséré par le code rouvre la même autocomplétion que s'il était tapé. Un texte sélectionné n'est pas remplacé par le « # » : la liste
    // s'ouvre devant lui, sur l'onglet Chips, pour l'entourer d'un bloc « Texte conditionnel » (js/conditional-text.js:startFromSelection).
    bind('v2-btn-insert-variable', () => { if (!ConditionalText.startFromSelection(editor)) editor.chain().focus().insertContent(Variables.triggerChar()).run(); });
    // Le pinceau de mise en forme câble lui-même son clic et son double-clic (js/format-painter.js).
    FormatPainter.wire(editor);
    bind('v2-btn-undo', () => editor.chain().focus().undo().run());
    bind('v2-btn-redo', () => editor.chain().focus().redo().run());
    bind('v2-btn-track-changes', () => editor.chain().focus().toggleSuggestMode().run());
    // Variante découpée : celle de la bibliothèque est en O(N²) pour « tout accepter ou refuser » (js/track-changes.js).
    bind('v2-btn-accept-all', () => editor.chain().focus().acceptAllSuggestionsChunked().run());
    bind('v2-btn-reject-all', () => editor.chain().focus().rejectAllSuggestionsChunked().run());

    wireHeadingMenu();
    wireSelectionDependentSelects();
    wireCompactFontSizeControls();
  }

  // Menu « Titre » (niveau et numérotation) : chaque réglage reste porté par un <select> caché, source de vérité ; le panneau pose sa valeur puis
  // redéclenche 'change'. Aucune restauration de sélection nécessaire : un <span> ou un <button> ne vole pas le focus comme un <select>.
  function wireHeadingMenu() {
    const headerSelect = byId('v2-header-select');
    const flyout = byId('v2-heading-flyout');
    if (headerSelect && flyout) {
      flyout.querySelectorAll('.v2-hover-row[data-level]').forEach(row => {
        row.addEventListener('click', () => {
          if (headerSelect.value === row.dataset.level) return;
          headerSelect.value = row.dataset.level;
          headerSelect.dispatchEvent(new Event('change'));
        });
      });
    }
    // Réglage de document, pas de sélection : le data-attribute est posé avant la commande pour que le rafraîchissement synchrone du sommaire,
    // qu'elle déclenche, lise déjà la bonne valeur.
    const select = byId('v2-heading-numbering-select');
    if (!select) return;
    select.addEventListener('change', () => {
      editor.view.dom.dataset.headingStyle = select.value;
      editor.chain().setHeadingNumberingStyle(select.value).focus().run();
    });
    if (!flyout) return;
    const numButtons = flyout.querySelectorAll('#v2-numbering-seg [data-num]');
    const syncActiveNum = () => numButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.num === select.value));
    numButtons.forEach(btn => btn.addEventListener('click', () => {
      if (select.value === btn.dataset.num) return;
      select.value = btn.dataset.num;
      select.dispatchEvent(new Event('change'));
      syncActiveNum();
    }));
    // Relu à chaque survol : la valeur peut changer sans passer par ici (le chargement d'un modèle pose select.value directement).
    const group = byId('v2-heading-group');
    if (group) group.addEventListener('mouseenter', syncActiveNum);
    syncActiveNum();
  }

  // Un <select> vole le focus dès le pointerdown, avant 'change', contrairement à un <button> : la sélection à mettre en forme est capturée à ce
  // moment, puis restaurée avant la commande.
  function wireSelectionDependentSelects() {
    const { captureSelection, withSavedSelection } = EditorCore.createSelectionPreserver();
    const bindSelect = (id, onChange) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener('pointerdown', captureSelection);
      el.addEventListener('change', () => onChange(el.value));
    };
    bindSelect('v2-header-select', value => withSavedSelection(chain => {
      if (value === 'p') chain.setParagraph(); else chain.toggleHeading({ level: parseInt(value, 10) });
    }));
  }

  const FONT_SIZE_PRESETS = ['8pt', '9pt', '10pt', '10.5pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '32pt', '36pt', '48pt', '72pt'];
  const FONT_FAMILY_PRESETS = [
    { value: 'Roboto', labelKey: 'font.robotoDefault' },
    { value: 'Arial', label: 'Arial' },
    { value: 'Times New Roman', label: 'Times New Roman' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Courier New', label: 'Courier New' },
    { value: 'Calibri', label: 'Calibri' },
  ];

  function wireCompactFontSizeControls() {
    const { captureSelection, withSavedSelection } = EditorCore.createSelectionPreserver();

    // data-i18n : le panneau flotte dans <body>, I18n.setLang() retraduit donc ce bouton sans rebâtir le panneau.
    const fontHtml = FONT_FAMILY_PRESETS.map(o => o.labelKey
      ? `<button data-action="${o.value}" data-i18n="${o.labelKey}">${I18n.t(o.labelKey)}</button>`
      : `<button data-action="${o.value}">${o.label}</button>`).join('');
    const fontPanel = EditorCore.createFloatingPanel('v2-format-panel', fontHtml, (value) => {
      withSavedSelection(chain => chain.setFontFamily(value));
      EditorCore.closeDropdownPanel();
    });
    EditorCore.wireDropdownButton(byId('v2-font-chip'), fontPanel, captureSelection);

    const sizeHtml = FONT_SIZE_PRESETS.map(s => `<button data-action="${s}">${s}</button>`).join('');
    const sizePanel = EditorCore.createFloatingPanel('v2-format-panel', sizeHtml, (value) => {
      withSavedSelection(chain => chain.setFontSize(value));
      EditorCore.closeDropdownPanel();
    });
    const sizeValBtn = byId('v2-size-chip-val');
    EditorCore.wireDropdownButton(sizeValBtn, sizePanel, captureSelection);
    const stepSize = (delta) => {
      captureSelection();
      const current = sizeValBtn.textContent.trim();
      const idx = FONT_SIZE_PRESETS.indexOf(current);
      const nextIdx = idx === -1 ? (delta > 0 ? 0 : FONT_SIZE_PRESETS.length - 1) : Math.min(FONT_SIZE_PRESETS.length - 1, Math.max(0, idx + delta));
      withSavedSelection(chain => chain.setFontSize(FONT_SIZE_PRESETS[nextIdx]));
    };
    const minusBtn = byId('v2-size-minus');
    const plusBtn = byId('v2-size-plus');
    if (minusBtn) minusBtn.addEventListener('mousedown', (event) => { event.preventDefault(); stepSize(-1); });
    if (plusBtn) plusBtn.addEventListener('mousedown', (event) => { event.preventDefault(); stepSize(1); });
  }

  return {
    setEditor, setEmailMode, setMacroMode, setGridMode, syncToolbarState, wireToolbar,
  };
})();
