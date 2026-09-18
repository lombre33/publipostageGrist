// Barre d'outils statique principale - extrait de editor.js (découpage 2026). Ferme directement sur sa propre référence d'éditeur (posée une fois via
// setEditor(), appelé depuis Editor.init()) : wireToolbar/syncToolbarState/etc. sont câblées une seule fois et leurs gestionnaires d'évènements ont besoin
// de retrouver l'éditeur bien après leur mise en place.
const MainToolbar = (function () {
  let editor = null;
  function setEditor(ed) { editor = ed; }
  let currentAlign = 'left';

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
  async function openImageVariablePicker(anchorEl) {
    const box = ensureImageVarPickerBox();
    await GristAPI.refreshSchema().catch(() => {});
    const candidates = GristAPI.getAllVariables().filter(v => GristAPI.getColumnType(v.table, v.column) === 'Attachments');
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
          editor.chain().focus().insertImage({ varTable: v.table, varColumn: v.column, varKey: v.key, width: '320px', height: '240px' }).run();
          box.style.display = 'none';
        });
        box.appendChild(item);
      });
    }
    const rect = anchorEl.getBoundingClientRect();
    box.style.position = 'absolute';
    box.style.left = (rect.left + window.scrollX) + 'px';
    box.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    box.style.display = 'block';
  }
  // Teste en avance le fetch() que pdf-export.js refera à l'export (même URL) ; avertit si un CORS permissif manque, sans bloquer l'insertion déjà faite.
  async function warnIfImageUrlNotExportable(src) {
    if (!src || src.startsWith('data:')) return;
    try {
      const resp = await fetch(src);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      await resp.blob();
    } catch (e) {
      console.warn('[Editor] image probablement non exportable en PDF (CORS) :', src, e);
      window.alert(I18n.t('image.corsWarning'));
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
    set('v2-btn-insert-variable', 'variable');
    set('v2-btn-undo', 'undo'); set('v2-btn-redo', 'redo');
    set('v2-highlight-icon', 'highlight');
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
    setDisabled('v2-btn-indent', !editor.can().sinkListItem('listItem'));
    setDisabled('v2-btn-outdent', !editor.can().liftListItem('listItem'));
    // En-tête/pied : verrouille tableau/2-colonnes/saut de page/sommaire/numérotation (sans objet ici) ; l'image reste active, seul son calque
    // devant/derrière est bloqué plus bas.
    const inHfMode = !!HeaderFooterPreview.getHfMode();
    const setLocked = (id, locked) => { const el = document.getElementById(id); if (el) el.classList.toggle('v2-hf-locked', !!locked); };
    setLocked('v2-btn-table', inHfMode);
    setLocked('v2-btn-two-columns', inHfMode);
    setLocked('v2-btn-page-break', inHfMode);
    setLocked('v2-btn-toc', inHfMode);
    // Numérotation seule verrouillée : un niveau de titre garde un sens dans un en-tête/pied, la numérotation (titres du flux principal seul) non.
    setLocked('v2-numbering-seg', inHfMode);
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
    bind('v2-btn-bullet', () => editor.chain().focus().toggleBulletList().run());
    // Styles de puce, révélés au survol du bouton "Liste à puces" (maquette "Options au survol") - crée la liste si le curseur n'y est pas encore, sinon
    // change juste le style de la liste existante à cet endroit.
    const applyBulletStyle = (style) => {
      const chain = editor.chain().focus();
      if (!editor.isActive('bulletList')) chain.toggleBulletList();
      chain.updateAttributes('bulletList', { bulletStyle: style }).run();
    };
    bind('v2-btn-bullet-disc', () => applyBulletStyle('disc'));
    bind('v2-btn-bullet-circle', () => applyBulletStyle('circle'));
    bind('v2-btn-bullet-square', () => applyBulletStyle('square'));
    const applyOrderedStyle = (style) => {
      const chain = editor.chain().focus();
      if (!editor.isActive('orderedList')) chain.toggleOrderedList();
      chain.updateAttributes('orderedList', { numberStyle: style }).run();
    };
    bind('v2-btn-ordered-numeric', () => applyOrderedStyle('decimal'));
    bind('v2-btn-ordered-alpha', () => applyOrderedStyle('alpha'));
    bind('v2-btn-ordered-roman', () => applyOrderedStyle('roman'));
    const applyTaskListStyle = (style) => {
      const chain = editor.chain().focus();
      if (!editor.isActive('taskList')) chain.toggleTaskList();
      chain.updateAttributes('taskList', { taskListStyle: style }).run();
    };
    bind('v2-btn-checklist-accent-strike', () => applyTaskListStyle('accentStrike'));
    bind('v2-btn-checklist-classic', () => applyTaskListStyle('classic'));
    bind('v2-btn-checklist-accent-plain', () => applyTaskListStyle('accentPlain'));
    // No-op sans erreur hors d'une liste, d'où l'état désactivé (syncToolbarState) plutôt qu'un masquage complet du bouton.
    bind('v2-btn-outdent', () => editor.chain().focus().liftListItem('listItem').run());
    bind('v2-btn-indent', () => editor.chain().focus().sinkListItem('listItem').run());
    bind('v2-btn-table', () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run());
    bind('v2-btn-two-columns', () => editor.chain().focus().insertTwoColumns().run());
    bind('v2-btn-image', async () => {
      const url = window.prompt(I18n.t('image.urlPrompt'));
      if (!url) return;
      await Editor.insertImageAtDefaultSize(url);
      warnIfImageUrlNotExportable(url);
    });
    bind('v2-btn-image-from-variable', () => openImageVariablePicker(document.getElementById('v2-btn-image-from-variable')));
    bind('v2-btn-page-break', () => editor.chain().focus().insertPageBreak().run());
    bind('v2-btn-toc', () => editor.chain().focus().insertToc().run());
    bind('v2-btn-comment', () => Comments.insertCommentAtSelection());
    // Insère juste le caractère déclencheur : @tiptap/suggestion (Variables.createExtension) surveille le document, pas les frappes clavier - l'inséré
    // programmatiquement rouvre donc la même autocomplétion que si l'utilisateur venait de le taper, sans dupliquer sa logique.
    bind('v2-btn-insert-variable', () => editor.chain().focus().insertContent(Variables.triggerChar()).run());
    bind('v2-btn-undo', () => editor.chain().focus().undo().run());
    bind('v2-btn-redo', () => editor.chain().focus().redo().run());

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
    { value: 'Roboto', label: 'Roboto (par défaut)' },
    { value: 'Arial', label: 'Arial' },
    { value: 'Times New Roman', label: 'Times New Roman' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Courier New', label: 'Courier New' },
    { value: 'Calibri', label: 'Calibri' },
  ];

  function wireCompactFontSizeControls() {
    const { captureSelection, withSavedSelection } = EditorCore.createSelectionPreserver();

    const fontHtml = FONT_FAMILY_PRESETS.map(o => `<button data-action="${o.value}">${o.label}</button>`).join('');
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
    setEditor, applyToolbarIcons, syncToolbarState, wireToolbar, wireHeadingMenu,
    wireSelectionDependentSelects, wireCompactFontSizeControls,
  };
})();
