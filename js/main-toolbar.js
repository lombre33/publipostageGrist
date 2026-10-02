// Barre d'outils statique principale - extrait de editor.js (découpage 2026). Ferme directement sur sa propre référence d'éditeur (posée une fois via
// setEditor(), appelé depuis Editor.init()) : wireToolbar/syncToolbarState/etc. sont câblées une seule fois et leurs gestionnaires d'évènements ont besoin
// de retrouver l'éditeur bien après leur mise en place.
const MainToolbar = (function () {
  let editor = null;
  function setEditor(ed) { editor = ed; }
  let currentAlign = 'left';
  // Mode email (planning/feature-email-mode.md) : posé par js/main.js quand le modèle courant est un modèle email - pas de module dédié, un simple drapeau
  // relu à chaque syncToolbarState comme inHfMode ci-dessous (HeaderFooterPreview.getHfMode()).
  let inEmailMode = false;
  function setEmailMode(active) { inEmailMode = !!active; }
  // Macro modèle (planning/feature-macro-modeles.md) : même drapeau/patron que inEmailMode ci-dessus, posé par js/main.js quand le modèle courant est de
  // type 'macro' - aucun contenu TipTap propre pour ce type (l'éditeur partagé reste vide), donc verrouille STRICTEMENT PLUS de boutons qu'en mode email
  // (qui a, lui, un vrai corps de document à mettre en forme).
  let inMacroMode = false;
  function setMacroMode(active) { inMacroMode = !!active; }
  // Mode grille (planning/feature-mode-grille-excel.md) : même patron, posé par js/main.js quand le modèle courant est de type 'grille' - un tableau unique, sans
  // feuille. GRID_LOCKED_IDS = ce qui n'a aucun sens dans un tableau unique, grisé et jamais retiré (règle d'Antoine) ; « Lien » reste actif (un lien dans une case a
  // un sens). Les boutons qui ouvrent sur un autre type de bloc (citation, bloc de code, encadré, signature du menu Lien) en font partie ; un fil qui ajoute un bouton de ce menu
  // l'ajoute ici, sauf une image : le QR code reste actif, il se pose sur sa case (comme le groupe Image) et l'Excel le dessine. Le saut de page n'y est pas : il se pose avant la ligne sélectionnée (GridEditor.togglePageBreak) et ne se grise que là où il n'a pas de sens (syncToolbarState).
  let inGridMode = false;
  function setGridMode(active) { inGridMode = !!active; }
  const GRID_LOCKED_IDS = [
    'v2-btn-table', 'v2-btn-two-columns', 'v2-btn-toc',
    'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature',
    'v2-btn-track-changes', 'v2-btn-accept-all', 'v2-btn-reject-all',
  ];
  const gridLockedIds = new Set();

  // Menu listant les colonnes Attachments : insère un placeholder lié à la #Variable (résolu en vraie image en mode Lecture/export).
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
  // Liste avec recherche (js/search-select.js) : le même champ que chaque choix de colonne de l'interface (demande d'Antoine du 2026-09-29). Le panneau
  // s'ouvre seul à côté de la ligne « Image depuis une variable » ; un <select> caché, posé dans un conteneur à part, porte les colonnes et reçoit `change`
  // au choix - l'insertion se fait là, comme avant elle se faisait au clic sur une ligne de l'ancienne liste.
  let imageVarSearch = null;
  function closeImageVariableSearch(instance) {
    if (!imageVarSearch || (instance && instance !== imageVarSearch)) return;
    const { host, search } = imageVarSearch;
    imageVarSearch = null;
    try { search.destroy(); } catch (e) { /* déjà défait */ }
    host.remove();
  }
  // Rend faux si le composant n'est pas disponible (fichier introuvable, erreur) : l'appelant garde alors la liste simple d'avant.
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
        select.appendChild(option);
      });
      host.appendChild(select);
      document.body.appendChild(host);
      select.selectedIndex = -1; // rien de choisi au départ : même la première ligne déclenche `change`
      // Ancre = la ligne du menu Image ; si ce menu s'est déjà refermé (ligne en display:none, rectangle nul), repli sur le bouton Image lui-même plutôt que
      // le coin haut-gauche de la fenêtre.
      const anchorRect = () => {
        const rect = anchorEl.getBoundingClientRect();
        return rect.width || rect.height ? rect : document.getElementById('v2-btn-image').getBoundingClientRect();
      };
      const search = SearchSelect.attachColumns(select, {
        popup: true,
        anchor: anchorRect,
        // Défait après la fin de l'évènement en cours (un blur ou un clic qui ferme le panneau ne doit pas retirer l'élément qui le porte). Le focus revient à
        // l'éditeur quand la fermeture vient du clavier (Échap) ou d'un choix ; après un clic ailleurs, il est déjà là où la personne a cliqué.
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
    // Les colonnes de la table de la page en tête (celles de la table parcourue par la zone répétée où est le curseur avant elles), comme la liste « # ».
    const candidates = Variables.prioritizeTables(
      GristAPI.getAllVariables().filter(v => GristAPI.getColumnType(v.table, v.column) === 'Attachments'), Variables.currentTables(editor));
    // La liste avec recherche d'abord ; la liste simple d'avant reste pour le message « aucune colonne » et quand le composant n'est pas disponible.
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
        // mousedown (pas click) + preventDefault : évite que le blur du focus éditeur en cours (déclenché par ce clic) ne referme/perturbe la sélection avant
        // que insertImage n'ait pu s'exécuter - même précaution que ac-item (variables.js:render, mousedown+preventDefault).
        item.addEventListener('mousedown', event => {
          event.preventDefault();
          insertVariableImage(v);
          box.style.display = 'none';
        });
        box.appendChild(item);
      });
    }
    // Ancre = la ligne du menu Image ; si ce menu s'est déjà refermé (ligne en display:none, rectangle nul), repli sur le bouton Image lui-même plutôt que
    // le coin haut-gauche de la fenêtre. Placé une fois affiché, pour rester dans la fenêtre (ViewportFit.placePopup).
    let rect = anchorEl.getBoundingClientRect();
    if (!rect.width && !rect.height) rect = document.getElementById('v2-btn-image').getBoundingClientRect();
    box.style.display = 'block';
    ViewportFit.placePopup(box, rect, { gap: 4 });
  }
  // Image insérée par URL : convertie en data URI ICI, avant insertion, plutôt qu'à chaque export (même
  // fetch que pdf-export.js:inlineEditorImagesAsDataUri, avancé au moment de l'import) - l'URL externe
  // brute n'est ainsi plus jamais stockée dans le modèle (retour Antoine, 2026-09-28). Repli sur l'URL
  // brute si la conversion échoue (CORS/réseau) : l'image reste utilisable en éditeur/lecture, seul
  // l'export PDF/DOCX pourra échouer à l'inclure (même avertissement qu'avant).
  async function urlToDataUriOrWarn(src) {
    if (!src || src.startsWith('data:')) return src;
    try {
      const resp = await fetch(src);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const blob = await resp.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('FileReader a échoué'));
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('[Editor] image par URL non convertible en data URI (CORS/réseau), URL brute conservée :', src, e);
      window.alert(I18n.t('image.corsWarning'));
      return src;
    }
  }
  function applyToolbarIcons() {
    const set = (id, icon) => { const el = document.getElementById(id); if (el) el.innerHTML = Icons.svg(icon); };
    set('v2-btn-bold', 'bold'); set('v2-btn-italic', 'italic');
    set('v2-btn-underline', 'underline'); set('v2-btn-strike', 'strike');
    set('v2-btn-align-left', 'alignLeft'); set('v2-btn-align-center', 'alignCenter');
    set('v2-btn-align-right', 'alignRight'); set('v2-btn-align-justify', 'alignJustify');
    // v2-btn-align-main : icône initiale, resynchronisée dès le premier appel de syncToolbarState avec l'alignement réel du curseur.
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
    // Menu « Lien et blocs de contenu » (js/link-dialog.js, js/callout.js, js/qr-code.js) : l'icône du bouton est celle du lien, chaque ligne du menu garde la sienne devant son texte.
    set('v2-btn-link', 'link');
    const setRowIcon = (id, icon) => { const slot = document.querySelector('#' + id + ' .v2-menu-row-icon'); if (slot) slot.innerHTML = Icons.svg(icon); };
    setRowIcon('v2-row-link', 'link'); setRowIcon('v2-btn-citation', 'blockquote'); setRowIcon('v2-btn-code-block', 'codeBlock');
    setRowIcon('v2-btn-callout', 'callout'); setRowIcon('v2-btn-signature', 'signature'); setRowIcon('v2-btn-qr', 'qr');
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

  // Retour visuel d'état actif, recalculé à chaque sélection/transaction (pas seulement au clic) pour rester juste au clavier/à la souris aussi.
  function syncToolbarState() {
    const setActive = (id, isActive) => { const el = document.getElementById(id); if (el) el.classList.toggle('is-active', !!isActive); };
    setActive('v2-btn-bold', editor.isActive('bold'));
    setActive('v2-btn-italic', editor.isActive('italic'));
    setActive('v2-btn-underline', editor.isActive('underline'));
    setActive('v2-btn-strike', editor.isActive('strike'));
    setActive('v2-btn-align-left', editor.isActive({ textAlign: 'left' }));
    setActive('v2-btn-align-center', editor.isActive({ textAlign: 'center' }));
    setActive('v2-btn-align-right', editor.isActive({ textAlign: 'right' }));
    setActive('v2-btn-align-justify', editor.isActive({ textAlign: 'justify' }));
    // Bouton principal du groupe survol "Alignement" : montre toujours l'alignement réel du curseur, relu par son propre clic pour le réappliquer.
    const aligns = ['left', 'center', 'right', 'justify'];
    currentAlign = aligns.find(a => editor.isActive({ textAlign: a })) || 'left';
    const alignMain = document.getElementById('v2-btn-align-main');
    if (alignMain) alignMain.innerHTML = Icons.svg('align' + currentAlign[0].toUpperCase() + currentAlign.slice(1));
    // Bouton "Liste" fusionné : actif dès qu'un des trois types l'est.
    setActive('v2-btn-bullet', editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList'));
    const bulletStyle = editor.isActive('bulletList') ? (editor.getAttributes('bulletList').bulletStyle || 'disc') : null;
    setActive('v2-btn-bullet-disc', bulletStyle === 'disc');
    setActive('v2-btn-bullet-circle', bulletStyle === 'circle');
    setActive('v2-btn-bullet-square', bulletStyle === 'square');
    const orderedStyle = editor.isActive('orderedList') ? (editor.getAttributes('orderedList').numberStyle || 'decimal') : null;
    setActive('v2-btn-ordered-numeric', orderedStyle === 'decimal');
    setActive('v2-btn-ordered-alpha', orderedStyle === 'alpha');
    setActive('v2-btn-ordered-roman', orderedStyle === 'roman');
    const taskListStyle = editor.isActive('taskList') ? (editor.getAttributes('taskList').taskListStyle || 'accentStrike') : null;
    setActive('v2-btn-checklist-accent-strike', taskListStyle === 'accentStrike');
    setActive('v2-btn-checklist-classic', taskListStyle === 'classic');
    setActive('v2-btn-checklist-accent-plain', taskListStyle === 'accentPlain');
    const setDisabled = (id, disabled) => { const el = document.getElementById(id); if (el) el.disabled = !!disabled; };
    // Sur une sélection de cases, `can()` est toujours faux (son début est avant la liste, pas dedans) : les boutons se grisent d'après les listes que les cases contiennent.
    const cellsSelected = EditorCore.isCellSelection(editor.state.selection);
    setDisabled('v2-btn-indent', cellsSelected ? !EditorCore.canShiftListsInSelectedCells('in') : !editor.can().sinkListItem('listItem'));
    setDisabled('v2-btn-outdent', cellsSelected ? !EditorCore.canShiftListsInSelectedCells('out') : !editor.can().liftListItem('listItem'));
    // Suivi des modifications : le bouton bascule reste toujours actionnable (règle d'Antoine, jamais de bouton masqué) ; accepter/refuser tout se grisent
    // sans document en attente au lieu de disparaître, recalculé à chaque transaction (accepter/refuser une suggestion, bascule du mode) via ce même hook.
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
    setActive('v2-btn-track-changes', Editor.isTrackChangesOn());
    const hasPending = Editor.hasPendingTrackedChanges();
    setDisabled('v2-btn-accept-all', !hasPending);
    setDisabled('v2-btn-reject-all', !hasPending);
    // En-tête/pied : verrouille tableau/2-colonnes/saut de page/sommaire/numérotation (sans objet ici) ; l'image reste active, seul son calque
    // devant/derrière est bloqué plus bas.
    const inHfMode = !!HeaderFooterPreview.getHfMode();
    const lockedNow = new Set();
    const setLocked = (id, locked) => { const el = document.getElementById(id); if (!el) return; el.classList.toggle('v2-hf-locked', !!locked); if (locked) lockedNow.add(id); };
    setLocked('v2-btn-table', inHfMode);
    setLocked('v2-btn-two-columns', inHfMode);
    setLocked('v2-btn-page-break', inHfMode);
    setLocked('v2-btn-toc', inHfMode);
    // Numérotation seule verrouillée : un niveau de titre garde un sens dans un en-tête/pied, la numérotation (titres du flux principal seul) non.
    setLocked('v2-numbering-seg', inHfMode);
    // Mode email : verrouille tout ce qui n'a aucun sens dans un mailto: (texte brut - cf. en-tête js/mailto-export.js). Titres, listes/retrait, commentaire,
    // annuler/rétablir et #Variable restent actifs (liste exhaustive des USABLE de ce fichier) - tout le reste de la mise en forme est grisé, jamais retiré
    // (règle d'Antoine). Les groupes à survol (alignement, image) sont verrouillés dans leur ENTIER (pointer-events hérite aux descendants, cf.
    // css/toolbar-v2.css:208) pour bloquer aussi leur volet déroulant, pas seulement leur bouton visible.
    setLocked('v2-btn-bold', inEmailMode || inMacroMode);
    setLocked('v2-btn-italic', inEmailMode || inMacroMode);
    setLocked('v2-btn-underline', inEmailMode || inMacroMode);
    setLocked('v2-btn-strike', inEmailMode || inMacroMode);
    setLocked('v2-align-group', inEmailMode || inMacroMode);
    setLocked('v2-size-stepper', inEmailMode || inMacroMode);
    setLocked('v2-font-chip', inEmailMode || inMacroMode);
    setLocked('v2-text-color-split', inEmailMode || inMacroMode);
    setLocked('v2-highlight-split', inEmailMode || inMacroMode);
    setLocked('v2-btn-format-painter', inEmailMode || inMacroMode);
    setLocked('v2-btn-table', inEmailMode || inMacroMode);
    setLocked('v2-btn-two-columns', inEmailMode || inMacroMode);
    setLocked('v2-image-group', inEmailMode || inMacroMode);
    // Dans une grille le bouton pose (ou retire) le saut avant la ligne sélectionnée : grisé sur la première ligne et au milieu d'une case fusionnée sur plusieurs lignes, enfoncé sur une ligne qui
    // en porte un ; son libellé le dit (un autre texte pour la même icône, dans les deux langues : les clés suivent le mode, I18n.applyTranslations les relit au changement de langue).
    setLocked('v2-btn-page-break', inEmailMode || inMacroMode || (inGridMode && !GridEditor.canTogglePageBreak(editor)));
    const pageBreakBtn = document.getElementById('v2-btn-page-break');
    if (pageBreakBtn) {
      const keys = inGridMode ? ['insert.pageBreak.gridTip', 'insert.pageBreak.gridAria'] : ['insert.pageBreak.tip', 'insert.pageBreak.aria'];
      if (pageBreakBtn.getAttribute('data-i18n-tip') !== keys[0]) {
        pageBreakBtn.setAttribute('data-i18n-tip', keys[0]); pageBreakBtn.setAttribute('data-i18n-aria', keys[1]);
        pageBreakBtn.setAttribute('data-tip', I18n.t(keys[0])); pageBreakBtn.setAttribute('aria-label', I18n.t(keys[1]));
      }
      const onBreak = inGridMode && GridEditor.hasPageBreak(editor);
      setActive('v2-btn-page-break', onBreak);
      if (inGridMode) pageBreakBtn.setAttribute('aria-pressed', onBreak ? 'true' : 'false'); else pageBreakBtn.removeAttribute('aria-pressed');
    }
    setLocked('v2-btn-toc', inEmailMode || inMacroMode);
    // Un macro-modèle n'a aucun corps propre à mettre en forme (contrairement au mode email) : verrouille aussi ce que le mode email laisse actif.
    setLocked('v2-heading-group', inMacroMode);
    setLocked('v2-btn-comment', inMacroMode);
    setLocked('v2-btn-insert-variable', inMacroMode);
    setLocked('v2-btn-undo', inMacroMode);
    setLocked('v2-btn-redo', inMacroMode);
    setLocked('v2-btn-find', inMacroMode);
    setLocked('v2-btn-track-changes', inMacroMode);
    // Menu « Lien et blocs de contenu » : grisé en entier pour un macro-modèle (comme le reste de la barre) ; en édition, deux lignes se grisent selon la
    // sélection au lieu de disparaître - pas de lien dans un bloc de code ni sur une image seule, pas de bloc de code qui effacerait une variable ou une image.
    setLocked('v2-blocks-group', inMacroMode);
    const linkImpossible = !LinkDialog.canLinkHere(editor);
    setLocked('v2-btn-link', linkImpossible);
    setLocked('v2-row-link', linkImpossible);
    setLocked('v2-btn-code-block', !editor.isActive('codeBlock') && codeBlockWouldDropContent());
    // Encadré et signature : sans objet dans un e-mail (texte brut) ni dans un en-tête ou un pied de page ; la signature est une zone 2 colonnes, verrouillée là aussi.
    setLocked('v2-btn-callout', inEmailMode || inHfMode);
    setLocked('v2-btn-signature', inEmailMode || inHfMode);
    // QR code : une image, donc pas dans un e-mail (texte brut, le groupe Image y est grisé aussi) ; ni dans un en-tête ou un pied de page pour l'instant, la Lecture n'y résout pas
    // les colonnes (ReaderMode.resolveHeaderFooterZone). Dans une grille, la ligne reste active : l'image se pose sur sa case, résolue par ReaderMode.preview comme à la Lecture.
    setLocked('v2-btn-qr', inEmailMode || inHfMode);
    setLocked('v2-btn-accept-all', inMacroMode);
    setLocked('v2-btn-reject-all', inMacroMode);
    // Mode grille : appliqué APRÈS tous les verrouillages ci-dessus (le dernier appel gagne). En quittant la grille, un bouton que l'une des lignes ci-dessus gère
    // vient d'être recalculé par elle ; seul un bouton qu'aucune ne gère (la citation) est rendu ici ; ceux de l'encadré et de la signature, que la ligne ci-dessus grise pour un e-mail ou un en-tête, le restent.
    GRID_LOCKED_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (inGridMode) { el.classList.add('v2-hf-locked'); gridLockedIds.add(id); }
      else if (gridLockedIds.delete(id) && !lockedNow.has(id)) el.classList.remove('v2-hf-locked');
    });
    const headerSelect = document.getElementById('v2-header-select');
    if (headerSelect) {
      let value = 'p';
      for (let level = 1; level <= 6; level++) { if (editor.isActive('heading', { level })) value = String(level); }
      if (headerSelect.value !== value) headerSelect.value = value;
      const chipVal = document.getElementById('v2-heading-chip-val');
      if (chipVal) chipVal.textContent = value === 'p' ? 'Normal' : 'Titre ' + value;
      const headingFlyout = document.getElementById('v2-heading-flyout');
      if (headingFlyout) {
        headingFlyout.querySelectorAll('.v2-hover-row[data-level]').forEach(row => {
          row.classList.toggle('is-active', row.dataset.level === value);
        });
      }
    }
    const textStyleAttrs = editor.getAttributes('textStyle');
    EditorCore.setColorIcon('v2-text-color-icon', textStyleAttrs.color || null);
    EditorCore.setColorIcon('v2-highlight-icon', textStyleAttrs.backgroundColor || null);
    // Repli sur la police/taille réellement rendue (Roboto/10.5pt, cf. .tiptap dans editor-v2.css) en l'absence de marque explicite, plutôt qu'un
    // "Police"/"Taille" vide qui ne montrait jamais rien par défaut.
    const fontChipVal = document.getElementById('v2-font-chip-val');
    if (fontChipVal) { const value = textStyleAttrs.fontFamily || 'Roboto'; if (fontChipVal.textContent !== value) fontChipVal.textContent = value; }
    const sizeChipVal = document.getElementById('v2-size-chip-val');
    if (sizeChipVal) { const value = textStyleAttrs.fontSize || '10.5pt'; if (sizeChipVal.textContent !== value) sizeChipVal.textContent = value; }
  }
  // Bloc de code : du texte brut, sans marque ni bulle. Convertir un paragraphe qui porte une variable, une pastille ou une image l'effacerait en silence (ProseMirror
  // retire ce que le nouveau type n'accepte pas) : la ligne se grise dans ce cas (syncToolbarState). Gras, couleur ou lien, eux, sont simplement perdus, comme dans
  // tout bloc de code.
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
  // Plusieurs paragraphes sélectionnés, côte à côte et sans rien d'autre entre eux, deviennent UN bloc de code d'une ligne par paragraphe (la commande de TipTap en ferait un
  // bloc par paragraphe, empilés avec leurs marges). Vrai quand c'est fait ; faux laisse la main à la commande de TipTap (curseur seul, un paragraphe, liste ou tableau).
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
    // La ligne grisée ne se clique pas à la souris, mais le clavier (Tab, Entrée) et les .click() d'autres modules l'atteignent : le refus vit donc ici aussi.
    if (!editor.isActive('codeBlock') && codeBlockWouldDropContent()) return;
    if (!editor.isActive('codeBlock') && mergeSelectionIntoCodeBlock()) return;
    editor.chain().focus().toggleCodeBlock().run();
  }
  // Le raccourci du lien dépend de la plateforme (Ctrl+K ou ⌘K) : posé sur l'aria-label du bouton et dans la ligne « Lien… » du menu, et réécrit à chaque
  // changement de langue (applyTranslations remet sinon l'aria-label sans lui) - même schéma que decorateSaveButtonShortcut dans js/main.js.
  // Libellé de la ligne « Encadré… » : « Modifier l'encadré… » quand le curseur est dans un encadré. Réécrit à chaque changement d'état et de langue (data-i18n ne porte que
  // la version « insérer »).
  function relabelCallout(inside) {
    const label = document.getElementById('v2-btn-callout-label');
    if (label) label.textContent = I18n.t(inside ? 'insert.callout.rowEdit' : 'insert.callout.row');
  }
  // Libellé de la ligne « QR code… » (menu « Lien et blocs de contenu ») : « Modifier le QR code… » quand un QR code est sélectionné. Réécrit à chaque changement d'état et de langue.
  function relabelQr(selected) {
    const label = document.getElementById('v2-btn-qr-label');
    if (label) label.textContent = I18n.t(selected ? 'insert.qr.rowEdit' : 'insert.qr.row');
    // Le nom accessible porte le même verbe que le libellé vu (« Modifier … » / « Insérer … ») ; data-i18n-aria le garde juste au changement de langue.
    const row = document.getElementById('v2-btn-qr');
    if (row) {
      const key = selected ? 'insert.qr.ariaEdit' : 'insert.qr.aria';
      row.setAttribute('data-i18n-aria', key);
      row.setAttribute('aria-label', I18n.t(key));
    }
  }
  // La loupe (js/find-replace.js) : sa touche (Ctrl+F, ⌘F selon la plateforme, ou celle qu'on a choisie dans Réglages > Raccourcis, js/shortcuts.js) est posée sur l'infobulle et l'aria-label,
  // réécrits à chaque changement de langue ou de touche ; sans touche, sans parenthèses.
  function decorateFindShortcut() {
    const button = document.getElementById('v2-btn-find');
    if (!button) return;
    const label = Shortcuts.label('find');
    const suffix = label ? ' (' + label + ')' : '';
    button.setAttribute('data-tip', I18n.t('find.tip') + suffix);
    button.setAttribute('aria-label', I18n.t('find.button.aria') + suffix);
  }
  function decorateLinkShortcut() {
    const label = LinkDialog.shortcutLabel();
    const button = document.getElementById('v2-btn-link');
    if (button) button.setAttribute('aria-label', I18n.t('insert.link.aria') + (label ? ' (' + label + ')' : ''));
    const kbd = document.getElementById('v2-row-link-kbd');
    if (kbd) kbd.textContent = label;
  }
  // Une seule instance, une seule toolbar : chaque bouton appelle directement une commande TipTap sur la sélection réelle, jamais besoin de savoir "suis-je
  // dans une cellule/colonne" avant d'agir.
  function wireToolbar() {
    applyToolbarIcons();
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bind('v2-btn-bold', () => editor.chain().focus().toggleBold().run());
    bind('v2-btn-italic', () => editor.chain().focus().toggleItalic().run());
    bind('v2-btn-underline', () => editor.chain().focus().toggleUnderline().run());
    bind('v2-btn-strike', () => editor.chain().focus().toggleStrike().run());
    bind('v2-btn-align-left', () => editor.chain().focus().setTextAlign('left').run());
    bind('v2-btn-align-center', () => editor.chain().focus().setTextAlign('center').run());
    bind('v2-btn-align-right', () => editor.chain().focus().setTextAlign('right').run());
    bind('v2-btn-align-justify', () => editor.chain().focus().setTextAlign('justify').run());
    // Bouton principal du groupe survol - réapplique l'alignement qu'il montre actuellement (currentAlign, tenu à jour par syncToolbarState) ; les 4 boutons
    // ci-dessus vivent maintenant dans le panneau révélé au survol (cf. index.html .v2-hover-flyout), inchangés sinon.
    bind('v2-btn-align-main', () => editor.chain().focus().setTextAlign(currentAlign).run());
    // Une liste se pose dans TOUTES les cases d'une sélection de cases (EditorCore.runOnSelectedCells : la commande ne regarde sinon que la case de tête) ; l'état voulu est
    // l'inverse de celui que le bouton montre (la case de tête) : enfoncé, un clic retire la liste de chaque case, sinon il la pose dans chacune.
    const toggleList = (name, command) => {
      const wanted = !editor.isActive(name);
      EditorCore.runOnSelectedCells(
        () => editor.chain().focus()[command]().run(),
        chain => chain.command(({ state, commands }) => { if (EditorCore.isInsideNode(state.selection.$from, name) !== wanted) commands[command](); return true; }));
    };
    bind('v2-btn-bullet', () => toggleList('bulletList', 'toggleBulletList'));
    // Style d'une liste : crée la liste si le curseur n'y est pas encore (dans chaque case d'une sélection de cases), sinon change juste le style de la liste existante à cet endroit.
    const applyListStyle = (name, command, attrs) => EditorCore.runOnSelectedCells(
      () => {
        const chain = editor.chain().focus();
        if (!editor.isActive(name)) chain[command]();
        chain.updateAttributes(name, attrs).run();
      },
      chain => chain
        .command(({ state, commands }) => { if (!EditorCore.isInsideNode(state.selection.$from, name)) commands[command](); return true; })
        .updateAttributes(name, attrs));
    // Styles de puce, révélés au survol du bouton "Liste à puces" (maquette "Options au survol").
    const applyBulletStyle = style => applyListStyle('bulletList', 'toggleBulletList', { bulletStyle: style });
    bind('v2-btn-bullet-disc', () => applyBulletStyle('disc'));
    bind('v2-btn-bullet-circle', () => applyBulletStyle('circle'));
    bind('v2-btn-bullet-square', () => applyBulletStyle('square'));
    const applyOrderedStyle = style => applyListStyle('orderedList', 'toggleOrderedList', { numberStyle: style });
    bind('v2-btn-ordered-numeric', () => applyOrderedStyle('decimal'));
    bind('v2-btn-ordered-alpha', () => applyOrderedStyle('alpha'));
    bind('v2-btn-ordered-roman', () => applyOrderedStyle('roman'));
    const applyTaskListStyle = style => applyListStyle('taskList', 'toggleTaskList', { taskListStyle: style });
    bind('v2-btn-checklist-accent-strike', () => applyTaskListStyle('accentStrike'));
    bind('v2-btn-checklist-classic', () => applyTaskListStyle('classic'));
    bind('v2-btn-checklist-accent-plain', () => applyTaskListStyle('accentPlain'));
    // No-op sans erreur hors d'une liste, d'où l'état désactivé (syncToolbarState) plutôt qu'un masquage complet du bouton. Sur une sélection de cases, chaque liste des cases se décale
    // (EditorCore.shiftListsInSelectedCells : les commandes ne regardent sinon que la case de tête, et se grisent) ; le premier élément d'une liste ne se décale pas, comme dans une case seule.
    bind('v2-btn-outdent', () => { if (!EditorCore.shiftListsInSelectedCells('out')) editor.chain().focus().liftListItem('listItem').run(); });
    bind('v2-btn-indent', () => { if (!EditorCore.shiftListsInSelectedCells('in')) editor.chain().focus().sinkListItem('listItem').run(); });
    bind('v2-btn-table', () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run());
    bind('v2-btn-two-columns', () => editor.chain().focus().insertTwoColumns().run());
    bind('v2-btn-image', async () => {
      const url = await Dialogs.prompt({ title: I18n.t('dialog.imageUrl.title'), label: I18n.t('image.urlPrompt'), confirmLabel: I18n.t('common.insert') });
      if (!url) return;
      const src = await urlToDataUriOrWarn(url);
      await Editor.insertImageAtDefaultSize(src);
    });
    bind('v2-btn-image-from-variable', () => openImageVariablePicker(document.getElementById('v2-btn-image-from-variable')));
    // Une grille n'a pas de page : le bouton y pose le saut de la ligne (le PDF y commence une page, l'Excel une feuille) ; un second clic le retire.
    bind('v2-btn-page-break', () => {
      if (GridEditor.isActive()) { GridEditor.togglePageBreak(editor); editor.chain().focus().run(); return; }
      editor.chain().focus().insertPageBreak().run();
    });
    bind('v2-btn-toc', () => editor.chain().focus().insertToc().run());
    bind('v2-btn-comment', () => Comments.insertCommentAtSelection());
    // Une icône pour trois fonctions (js/link-dialog.js) : le bouton et sa première ligne ouvrent la fenêtre du lien, les deux autres lignes mettent en forme.
    bind('v2-btn-link', () => LinkDialog.open());
    bind('v2-row-link', () => LinkDialog.open());
    // Nœud blockquote de StarterKit, déjà géré en PDF/DOCX/mode Lecture - seul un point d'entrée manquait. Sur une sélection de cases, toutes les cases entrent dans une citation (ou en sortent) :
    // l'état voulu est l'inverse de celui que le bouton montre (la case de tête), comme pour les listes.
    bind('v2-btn-citation', () => { if (!EditorCore.quoteSelectedCells(!EditorCore.isQuoteActive())) editor.chain().focus().toggleBlockquote().run(); });
    bind('v2-btn-code-block', toggleCodeBlock);
    // Encadré : une fenêtre (couleur, icône) pour l'insérer autour de la sélection ou, dans un encadré, pour le modifier ; signature : un morceau de document tout fait.
    bind('v2-btn-callout', () => Callout.open());
    bind('v2-btn-signature', () => Callout.insertSignature(editor));
    // QR code : une fenêtre (adresse ou texte, colonnes comprises) pour l'insérer ou, quand il est sélectionné, le modifier.
    bind('v2-btn-qr', () => QrCode.open());
    decorateLinkShortcut();
    I18n.onChange(decorateLinkShortcut);
    Shortcuts.onChange(decorateLinkShortcut);
    decorateFindShortcut();
    I18n.onChange(decorateFindShortcut);
    Shortcuts.onChange(decorateFindShortcut);
    bind('v2-btn-find', () => FindReplace.toggle());
    I18n.onChange(() => relabelCallout(Callout.isInside(editor)));
    I18n.onChange(() => relabelQr(QrCode.isSelected(editor)));
    // Insère juste le caractère déclencheur : @tiptap/suggestion (Variables.createExtension) surveille le document, pas les frappes clavier - l'inséré
    // programmatiquement rouvre donc la même autocomplétion que si l'utilisateur venait de le taper, sans dupliquer sa logique.
    // Du texte sélectionné n'est pas remplacé par le « # » : la liste s'ouvre devant lui, sur l'onglet Chips, pour entourer ce texte d'un bloc « Texte conditionnel »
    // (js/conditional-text.js:startFromSelection).
    bind('v2-btn-insert-variable', () => { if (!ConditionalText.startFromSelection(editor)) editor.chain().focus().insertContent(Variables.triggerChar()).run(); });
    // Le pinceau de mise en forme câble lui-même son clic et son double-clic (js/format-painter.js).
    FormatPainter.wire(editor);
    bind('v2-btn-undo', () => editor.chain().focus().undo().run());
    bind('v2-btn-redo', () => editor.chain().focus().redo().run());
    bind('v2-btn-track-changes', () => editor.chain().focus().toggleSuggestMode().run());
    // Chunked (pas la variante non découpée) : mitige le bug de perf O(N²) confirmé dans la lib pour "tout accepter/refuser" (js/track-changes.js).
    bind('v2-btn-accept-all', () => editor.chain().focus().acceptAllSuggestionsChunked().run());
    bind('v2-btn-reject-all', () => editor.chain().focus().rejectAllSuggestionsChunked().run());

    wireHeadingMenu();
    wireSelectionDependentSelects();
    wireCompactFontSizeControls();
  }

  // Menu "Titre" fusionné (niveau + numérotation) : les deux réglages restent portés par un <select> caché comme source de vérité, le flyout se contente de
  // poser sa valeur puis redéclencher 'change' - pas de restauration de sélection nécessaire (un <span>/<button> ne vole jamais le focus comme un <select>).
  function wireHeadingMenu() {
    const headerSelect = document.getElementById('v2-header-select');
    const flyout = document.getElementById('v2-heading-flyout');
    if (headerSelect && flyout) {
      flyout.querySelectorAll('.v2-hover-row[data-level]').forEach(row => {
        row.addEventListener('click', () => {
          if (headerSelect.value === row.dataset.level) return;
          headerSelect.value = row.dataset.level;
          headerSelect.dispatchEvent(new Event('change'));
        });
      });
    }
    // Réglage de document, pas de sélection : le data-attribute est posé avant de dispatcher la commande pour que le rafraîchissement synchrone du sommaire
    // (déclenché par elle) lise déjà la bonne valeur.
    const select = document.getElementById('v2-heading-numbering-select');
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
    // Lu à la volée à chaque survol : la valeur peut aussi changer sans passer par ici (chargement d'un modèle pose select.value directement).
    const group = document.getElementById('v2-heading-group');
    if (group) group.addEventListener('mouseenter', syncActiveNum);
    syncActiveNum();
  }

  // Un <select>, contrairement à un <button>, vole le focus dès le pointerdown (avant 'change') - la sélection à mettre en forme doit donc être capturée à ce
  // moment puis restaurée avant d'appliquer la commande.
  function wireSelectionDependentSelects() {
    const { captureSelection, withSavedSelection } = EditorCore.createSelectionPreserver();
    const bindSelect = (id, onChange) => {
      const el = document.getElementById(id);
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

    // data-i18n : le panneau flotte dans <body>, donc I18n.setLang() retraduit ce bouton sans qu'il faille rebâtir le panneau.
    const fontHtml = FONT_FAMILY_PRESETS.map(o => o.labelKey
      ? `<button data-action="${o.value}" data-i18n="${o.labelKey}">${I18n.t(o.labelKey)}</button>`
      : `<button data-action="${o.value}">${o.label}</button>`).join('');
    const fontPanel = EditorCore.createFloatingPanel('v2-format-panel', fontHtml, (value) => {
      withSavedSelection(chain => chain.setFontFamily(value));
      EditorCore.closeDropdownPanel();
    });
    EditorCore.wireDropdownButton(document.getElementById('v2-font-chip'), fontPanel, captureSelection);

    const sizeHtml = FONT_SIZE_PRESETS.map(s => `<button data-action="${s}">${s}</button>`).join('');
    const sizePanel = EditorCore.createFloatingPanel('v2-format-panel', sizeHtml, (value) => {
      withSavedSelection(chain => chain.setFontSize(value));
      EditorCore.closeDropdownPanel();
    });
    const sizeValBtn = document.getElementById('v2-size-chip-val');
    EditorCore.wireDropdownButton(sizeValBtn, sizePanel, captureSelection);
    const stepSize = (delta) => {
      captureSelection();
      const current = sizeValBtn.textContent.trim();
      const idx = FONT_SIZE_PRESETS.indexOf(current);
      const nextIdx = idx === -1 ? (delta > 0 ? 0 : FONT_SIZE_PRESETS.length - 1) : Math.min(FONT_SIZE_PRESETS.length - 1, Math.max(0, idx + delta));
      withSavedSelection(chain => chain.setFontSize(FONT_SIZE_PRESETS[nextIdx]));
    };
    const minusBtn = document.getElementById('v2-size-minus');
    const plusBtn = document.getElementById('v2-size-plus');
    if (minusBtn) minusBtn.addEventListener('mousedown', (event) => { event.preventDefault(); stepSize(-1); });
    if (plusBtn) plusBtn.addEventListener('mousedown', (event) => { event.preventDefault(); stepSize(1); });
  }

  return {
    setEditor, setEmailMode, setMacroMode, setGridMode, applyToolbarIcons, syncToolbarState, wireToolbar, wireHeadingMenu,
    wireSelectionDependentSelects, wireCompactFontSizeControls,
  };
})();
