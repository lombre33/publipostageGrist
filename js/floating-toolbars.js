// Barres flottantes contextuelles : couleur et surlignage, tableau, image, variable, modification suivie. Chacune ferme sur la référence de l'éditeur
// posée une fois par setEditor() (Editor.init()) : câblées une seule fois, leurs gestionnaires doivent retrouver l'éditeur bien après leur mise en
// place, contrairement aux fabriques de nœuds (js/editor-nodes.js).
const FloatingToolbars = (function () {
  let editor = null;
  function setEditor(ed) { editor = ed; }

  // Le nœud sélectionné s'il est de ce type. Duck-typing sur `.node` : une NodeSelection réelle échoue `instanceof` (deux exemplaires du module
  // prosemirror-state), et editor.isActive() reste vrai pour un simple texte sélectionné à travers le nœud.
  function selectedNode(typeName) {
    const node = editor.state.selection.node;
    return (node && node.type && node.type.name === typeName) ? node : null;
  }

  // Les contrôles d'une barre, retrouvés par leur data-action ou leur sélecteur.
  function controlsOf(panel) {
    const button = action => panel.el.querySelector(`button[data-action="${action}"]`);
    return {
      button,
      setActive(action, active) {
        const btn = button(action);
        if (btn) btn.classList.toggle('is-active', !!active);
      },
      // aria-disabled plutôt que disabled : un <button disabled> ne reçoit plus le survol, son info-bulle (qui dit pourquoi il est grisé) ne
      // s'afficherait pas.
      setDisabled(action, disabled, title) {
        const btn = button(action);
        if (!btn) return;
        btn.classList.toggle('is-disabled', !!disabled);
        btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        btn.title = title;
      },
      // Un champ qu'on est en train de saisir garde sa valeur.
      setField(selector, value) {
        const field = panel.el.querySelector(selector);
        if (field && document.activeElement !== field) field.value = value;
      },
    };
  }

  // Applique à toutes les cellules touchées par la sélection (CellSelection reconnue par duck-typing sur `forEachCell`, pas un instanceof).
  function setCellsBackground(nodeEditor, color) {
    const { state, view } = nodeEditor;
    const { selection } = state;
    if (typeof selection.forEachCell === 'function') {
      const tr = state.tr;
      selection.forEachCell((cell, pos) => {
        tr.setNodeMarkup(pos, undefined, Object.assign({}, cell.attrs, { backgroundColor: color }));
      });
      view.dispatch(tr);
      return;
    }
    nodeEditor.chain().updateAttributes('tableCell', { backgroundColor: color }).updateAttributes('tableHeader', { backgroundColor: color }).run();
  }
  const TEXT_COLOR_PRESETS = ['#000000', '#5f6368', '#c0392b', '#d68910', '#8a7000', '#1e8449', '#2874a6', '#7d3c98'];
  const FILL_COLOR_PRESETS = ['#fff2a8', '#c8f7c5', '#c8e6ff', '#ffd6d6', '#e6d6ff', '#ffe0b3', '#e0e0e0'];

  // Grille de nuances + case "personnalisé"/"aucune", partagée entre police, surlignage et fond de cellule. `onPick`/`onNone` reçoivent une chaîne
  // déjà focus+sélection restaurée et ne doivent jamais appeler .run() eux-mêmes.
  function createColorDropdown(presets, { noneLabel, onPick, onNone, withSavedSelection }) {
    const swatches = presets.map(c => `<button data-action="pick:${c}" style="background:${c}" title="${c}"></button>`).join('');
    const html = '<div class="v2-color-grid">' + swatches + '</div>'
      + '<div class="v2-color-dropdown-footer">'
      + `<button data-action="custom" title="${I18n.t('colorDropdown.custom')}">${Icons.svg('fill')}<span>${I18n.t('colorDropdown.customLabel')}</span></button>`
      + (onNone ? `<button data-action="none" title="${noneLabel}">${Icons.svg('noColor')}<span>${noneLabel}</span></button>` : '')
      + '</div>'
      + '<input type="color" class="v2-color-dropdown-native">';
    const panel = EditorCore.createFloatingPanel('v2-color-dropdown', html, (action) => {
      if (action === 'custom') { panel.el.querySelector('.v2-color-dropdown-native').click(); return; }
      if (action === 'none') { withSavedSelection(chain => onNone(chain)); EditorCore.closeDropdownPanel(); return; }
      if (action.indexOf('pick:') === 0) { const color = action.slice(5); withSavedSelection(chain => onPick(chain, color)); EditorCore.closeDropdownPanel(); }
    });
    panel.el.querySelector('.v2-color-dropdown-native').addEventListener('input', (event) => {
      withSavedSelection(chain => onPick(chain, event.target.value));
      EditorCore.closeDropdownPanel();
    });
    return panel;
  }

  // Menu « Bordures » d'une grille (css/grid.css) : une rangée de réglages en icônes, puis la couleur du stylo - la grille de nuances et le pied
  // « personnalisé » / « par défaut » du menu de couleur ci-dessus, sans refermer le menu au choix d'une couleur. `onPreset(preset)` et `onPen(color
  // | null)` ne touchent pas à l'éditeur eux-mêmes.
  function createBordersDropdown(presets, colors, { onPreset, onPen }) {
    const buttons = presets.map(([preset, icon, title]) => `<button data-action="borders:${preset}" title="${title}" aria-label="${title}">${Icons.svg(icon)}</button>`).join('');
    const swatches = colors.map(c => `<button data-action="pen:${c}" style="background:${c}" title="${c}" aria-label="${c}"></button>`).join('');
    const html = '<div class="v2-borders-presets">' + buttons + '</div>'
      + `<div class="v2-borders-pen">${I18n.t('table.bordersPen')}</div>`
      + '<div class="v2-color-grid">' + swatches + '</div>'
      + '<div class="v2-color-dropdown-footer">'
      + `<button data-action="pen-custom" title="${I18n.t('colorDropdown.custom')}">${Icons.svg('fill')}<span>${I18n.t('colorDropdown.customLabel')}</span></button>`
      + `<button data-action="pen-auto" title="${I18n.t('colorDropdown.noneDefault')}">${Icons.svg('noColor')}<span>${I18n.t('colorDropdown.noneDefault')}</span></button>`
      + '</div>'
      + '<input type="color" class="v2-color-dropdown-native">';
    const panel = EditorCore.createFloatingPanel('v2-color-dropdown v2-borders-dropdown', html, (action) => {
      if (action.indexOf('borders:') === 0) { onPreset(action.slice('borders:'.length)); return; }
      if (action === 'pen-custom') { panel.el.querySelector('.v2-color-dropdown-native').click(); return; }
      if (action === 'pen-auto') { onPen(null); return; }
      if (action.indexOf('pen:') === 0) onPen(action.slice('pen:'.length));
    });
    panel.el.querySelector('.v2-color-dropdown-native').addEventListener('input', event => onPen(event.target.value.toLowerCase()));
    return panel;
  }

  // Couleur de police / surlignage : bouton "appliquer" (réapplique la dernière couleur choisie) + bouton chevron séparé (menu de nuances).
  function wireColorPickers() {
    const { captureSelection, withSavedSelection } = EditorCore.createSelectionPreserver();
    // « Aucune couleur » n'est jamais mémorisée comme dernier choix : un clic rapide sur l'icône doit toujours appliquer une vraie couleur.
    let lastTextColor = TEXT_COLOR_PRESETS[0];
    let lastHighlightColor = FILL_COLOR_PRESETS[0];
    const wireQuickApply = (id, fn) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('mousedown', (event) => { event.preventDefault(); captureSelection(); withSavedSelection(fn); });
    };

    const textColorPanel = createColorDropdown(TEXT_COLOR_PRESETS, {
      noneLabel: I18n.t('colorDropdown.noneDefault'),
      withSavedSelection,
      onPick: (chain, color) => { lastTextColor = color; chain.setTextColor(color); EditorCore.setColorIcon('v2-text-color-icon', color); },
      onNone: (chain) => { chain.unsetTextColor(); EditorCore.setColorIcon('v2-text-color-icon', null); },
    });
    wireQuickApply('v2-btn-text-color', chain => chain.setTextColor(lastTextColor));
    EditorCore.wireDropdownButton(document.getElementById('v2-btn-text-color-caret'), textColorPanel, captureSelection);

    const highlightPanel = createColorDropdown(FILL_COLOR_PRESETS, {
      noneLabel: I18n.t('colorDropdown.none'),
      withSavedSelection,
      onPick: (chain, color) => { lastHighlightColor = color; chain.setHighlight(color); EditorCore.setColorIcon('v2-highlight-icon', color); },
      onNone: (chain) => { chain.unsetHighlight(); EditorCore.setColorIcon('v2-highlight-icon', null); },
    });
    wireQuickApply('v2-btn-highlight', chain => chain.setHighlight(lastHighlightColor));
    EditorCore.wireDropdownButton(document.getElementById('v2-btn-highlight-caret'), highlightPanel, captureSelection);
  }

  // Avec le suivi, « Supprimer la colonne » n'est pas possible à travers une case fusionnée (cf. Editor.selectedColumnsCrossMergedCell).
  function columnDeleteBlocked() {
    return Editor.isTrackChangesOn() && Editor.selectedColumnsCrossMergedCell();
  }
  // Idem pour « Supprimer la ligne » à travers une case fusionnée en hauteur (cf. Editor.selectedRowsCrossMergedCell).
  function rowDeleteBlocked() {
    return Editor.isTrackChangesOn() && Editor.selectedRowsCrossMergedCell();
  }

  // Toolbar de gestion de tableau : panneau flottant, visible seulement curseur dans une cellule, ancré sur le <table> réel.
  function wireTableFloatingToolbar() {
    const buttons = [
      ['row-before', 'rowBefore', I18n.t('table.rowBefore')],
      ['row-after', 'rowAfter', I18n.t('table.rowAfter')],
      ['row-del', 'rowDel', I18n.t('table.rowDel')],
      ['col-before', 'colBefore', I18n.t('table.colBefore')],
      ['col-after', 'colAfter', I18n.t('table.colAfter')],
      ['col-del', 'colDel', I18n.t('table.colDel')],
      ['table-del', 'trash', I18n.t('table.tableDel')],
    ];
    // Ce que seule une grille a (js/grid-editor.js) : bordures, alignement vertical. Posé dans la barre pour tous les tableaux, montré par
    // css/grid.css sous `body.pp-grid-mode` seulement. La fusion et la scission de cases sont à tous les tableaux (js/table-merge.js pour un
    // document, js/grid-editor.js pour une grille).
    const VALIGN_BUTTONS = [['valign-top', 'valignTop', 'top', I18n.t('table.valignTop')], ['valign-middle', 'valignMiddle', 'middle', I18n.t('table.valignMiddle')], ['valign-bottom', 'valignBottom', 'bottom', I18n.t('table.valignBottom')]];
    // Menu « Bordures » d'une grille : les huit réglages (icône, info-bulle) ; la couleur du stylo (null = le trait de départ) se choisit une fois et
    // reste pour les réglages suivants.
    const BORDER_PRESETS = [['all', 'bordersAll', I18n.t('table.bordersAll')], ['outer', 'bordersOuter', I18n.t('table.bordersOuter')], ['inner', 'bordersInner', I18n.t('table.bordersInner')],
      ['top', 'bordersTop', I18n.t('table.bordersTop')], ['bottom', 'bordersBottom', I18n.t('table.bordersBottom')], ['left', 'bordersLeft', I18n.t('table.bordersLeft')],
      ['right', 'bordersRight', I18n.t('table.bordersRight')], ['none', 'bordersNone', I18n.t('table.bordersNone')]];
    let penColor = null;
    // Les menus de la barre d'une grille (fond, bordures) s'ouvrent sous la bande où elle est fixée : au-dessus, ils recouvriraient la barre
    // d'outils.
    const menuPlacement = () => (GridEditor.isActive() ? { placement: 'bottom-start' } : undefined);
    const gridButton = (action, icon, title) => `<button data-action="${action}" class="v2-grid-only" title="${title}">${Icons.svg(icon)}</button>`;
    const html = buttons.map(([action, icon, title]) =>
      `<button data-action="${action}" title="${title}">${Icons.svg(icon)}</button>`).join('')
      + '<span class="v2-floating-sep"></span>'
      + `<button data-action="cell-merge" title="${I18n.t('table.cellMerge')}">${Icons.svg('cellMerge')}</button>`
      + `<button data-action="cell-split" title="${I18n.t('table.cellSplit')}">${Icons.svg('cellSplit')}</button>`
      + '<span class="v2-floating-sep"></span>'
      + `<button data-action="caption" title="${I18n.t('caption.addTable')}" aria-label="${I18n.t('caption.addTable')}">${Icons.svg('caption')}</button>`
      + `<button data-action="fill-open" class="v2-fill-chip" id="v2-table-fill-btn" title="${I18n.t('table.fillOpen')}">`
      + Icons.svg('fill') + '<span class="v2-fill-bar" id="v2-table-fill-bar"></span>' + Icons.svg('caretDown')
      + '</button>'
      + `<button data-action="borders-open" class="v2-fill-chip v2-borders-chip v2-grid-only" id="v2-table-borders-btn" title="${I18n.t('table.bordersOpen')}" aria-haspopup="true" aria-expanded="false">`
      + Icons.svg('borders') + Icons.svg('caretDown') + '</button>'
      + '<span class="v2-floating-sep v2-grid-only"></span>'
      + VALIGN_BUTTONS.map(([action, icon, , title]) => gridButton(action, icon, title)).join('');
    const panel = EditorCore.createFloatingPanel('v2-floating-toolbar', html, (action) => {
      const commands = {
        'row-before': () => editor.chain().focus().addRowBefore().run(),
        'row-after': () => editor.chain().focus().addRowAfter().run(),
        'row-del': () => { if (!rowDeleteBlocked()) editor.chain().focus().deleteRow().run(); },
        'col-before': () => editor.chain().focus().addColumnBefore().run(),
        'col-after': () => editor.chain().focus().addColumnAfter().run(),
        'col-del': () => { if (!columnDeleteBlocked()) editor.chain().focus().deleteColumn().run(); },
        'table-del': () => editor.chain().focus().deleteTable().run(),
        'cell-merge': () => (GridEditor.isActive() ? GridEditor.mergeCells(editor) : TableMerge.mergeCells(editor)),
        'cell-split': () => (GridEditor.isActive() ? GridEditor.splitCell(editor) : TableMerge.splitCell(editor)),
        'valign-top': () => GridEditor.setVerticalAlign(editor, 'top'),
        'valign-middle': () => GridEditor.setVerticalAlign(editor, 'middle'),
        'valign-bottom': () => GridEditor.setVerticalAlign(editor, 'bottom'),
        'borders-open': () => {
          const btn = document.getElementById('v2-table-borders-btn');
          if (EditorCore.getOpenDropdownPanel() === bordersPanel) { EditorCore.closeDropdownPanel(); return; }
          EditorCore.closeDropdownPanel();
          syncBordersPanel();
          bordersPanel.show(btn, menuPlacement());
          EditorCore.setOpenDropdownPanel(bordersPanel, btn);
        },
        caption: () => Caption.run(editor, 'table'),
        'fill-open': () => {
          const btn = document.getElementById('v2-table-fill-btn');
          if (EditorCore.getOpenDropdownPanel() === fillPanel) { EditorCore.closeDropdownPanel(); return; }
          EditorCore.closeDropdownPanel();
          fillPanel.show(btn, menuPlacement());
          EditorCore.setOpenDropdownPanel(fillPanel);
        },
      };
      (commands[action] || (() => {}))();
    });
    // Pas de sélection à restaurer ici : setCellsBackground lit editor.state.selection directement (persiste indépendamment du focus DOM).
    const fillPanel = createColorDropdown(FILL_COLOR_PRESETS, {
      noneLabel: I18n.t('colorDropdown.none'),
      withSavedSelection: fn => fn(null),
      onPick: (chain, color) => { setCellsBackground(editor, color); EditorCore.setColorBar('v2-table-fill-bar', color); },
      onNone: () => { setCellsBackground(editor, null); EditorCore.setColorBar('v2-table-fill-bar', null); },
    });
    // Menu « Bordures » : un réglage pose la couleur du stylo sur les traits qu'il vise (une seule transaction, un seul Annuler) et referme le menu ;
    // une couleur se choisit sans le refermer.
    const bordersPanel = createBordersDropdown(BORDER_PRESETS, TEXT_COLOR_PRESETS, {
      onPreset: (preset) => { if (GridEditor.applyBorders(editor, preset, penColor)) EditorCore.closeDropdownPanel(); },
      onPen: (color) => { penColor = color; markPen(); },
    });
    const markPen = () => {
      bordersPanel.el.querySelectorAll('button[data-action^="pen:"]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.action === 'pen:' + penColor));
      const auto = bordersPanel.el.querySelector('button[data-action="pen-auto"]');
      if (auto) auto.classList.toggle('is-active', penColor === null);
      const custom = bordersPanel.el.querySelector('button[data-action="pen-custom"]');
      if (custom) custom.classList.toggle('is-active', penColor !== null && !TEXT_COLOR_PRESETS.includes(penColor));
    };
    // « Intérieures » n'a rien à tracer pour une seule case : grisé (jamais retiré), un clic dessus ne fait rien.
    const syncBordersPanel = () => {
      const inner = bordersPanel.el.querySelector('button[data-action="borders:inner"]');
      if (inner) inner.setAttribute('aria-disabled', GridEditor.canApplyBorders(editor, 'inner') ? 'false' : 'true');
      markPen();
    };
    EditorCore.registerFloatingPanel(panel);
    // Boutons d'une grille selon la sélection : « Fusionner » et « Scinder » grisés quand ils n'ont pas de sens (jamais retirés), l'alignement
    // vertical des cases visées enfoncé (aucun quand la sélection mêle plusieurs alignements).
    const { button, setDisabled } = controlsOf(panel);
    const setLocked = (action, locked) => {
      const btn = button(action);
      if (!btn) return;
      btn.classList.toggle('v2-hf-locked', locked);
      btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
    };
    const syncFillBar = () => {
      const fill = editor.getAttributes('tableCell').backgroundColor || editor.getAttributes('tableHeader').backgroundColor;
      EditorCore.setColorBar('v2-table-fill-bar', fill || null);
    };
    // « Fusionner » et « Scinder » ont deux grisés : celui d'une grille (`v2-hf-locked`, sans raison) et celui d'un document (`is-disabled`, avec sa
    // raison pour info-bulle, comme « Supprimer la colonne »). La barre passe de l'un à l'autre sans se redessiner : chaque mode défait le grisé de
    // l'autre.
    const MERGE_BUTTONS = [['cell-merge', 'table.cellMerge', TableMerge.mergeBlock], ['cell-split', 'table.cellSplit', TableMerge.splitBlock]];
    const syncDocumentMergeButtons = () => {
      MERGE_BUTTONS.forEach(([action, labelKey, blockOf]) => {
        const btn = button(action);
        if (btn) btn.classList.remove('v2-hf-locked');
        const reason = blockOf(editor);
        setDisabled(action, !!reason, I18n.t(reason || labelKey));
      });
    };
    const syncGridButtons = () => {
      setLocked('table-del', true);
      // Pas de légende dans une grille : le bouton reste dans la barre, grisé, avec sa raison pour info-bulle (js/caption.js).
      Caption.syncButton(button('caption'), editor, 'table');
      MERGE_BUTTONS.forEach(([action, labelKey]) => setDisabled(action, false, I18n.t(labelKey)));
      setLocked('cell-merge', !GridEditor.canMerge(editor));
      setLocked('cell-split', !GridEditor.canSplit(editor));
      const align = GridEditor.selectedVerticalAlign(editor);
      VALIGN_BUTTONS.forEach(([action, , value]) => {
        const btn = button(action);
        if (!btn) return;
        btn.classList.toggle('is-active', align === value);
        btn.setAttribute('aria-pressed', align === value ? 'true' : 'false');
      });
    };
    const check = () => {
      // Une grille (js/grid-editor.js) : la barre est fixée dans sa bande au-dessus du tableau (css/grid.css) et y reste, focus ou non - posée sur la
      // case courante elle recouvrait les cases voisines (un appui dessus tombait sur ses boutons, rien ne se sélectionnait à la souris). « Supprimer
      // le tableau » est grisé (le garde-fou de la grille le refuserait de toute façon).
      if (GridEditor.isActive()) {
        const slot = GridEditor.barSlot();
        if (slot) {
          panel.dock(slot);
          syncGridButtons();
          syncFillBar();
          return;
        }
      }
      if (panel.isDocked()) panel.undock();
      // editor.isActive(...) ne change pas seul quand le focus quitte l'éditeur : hasFocus() ferme le panneau au clic hors de l'éditeur.
      if (!editor.view.hasFocus() || !editor.isActive('table')) { panel.hide(); return; }
      const { $from } = editor.state.selection;
      let depth = $from.depth;
      while (depth > 0 && $from.node(depth).type.name !== 'table') depth--;
      // nodeDOM d'une table renvoie le wrapper (.tableWrapper de prosemirror-tables), pas le <table> : on redescend dessus pour l'ancrage.
      const dom = depth > 0 ? editor.view.nodeDOM($from.before(depth)) : null;
      if (!dom) { panel.hide(); return; }
      panel.show(dom.tagName === 'TABLE' ? dom : (dom.querySelector && dom.querySelector('table')) || dom);
      setLocked('table-del', false);
      const colBlocked = columnDeleteBlocked();
      setDisabled('col-del', colBlocked, I18n.t(colBlocked ? 'table.colDelMerged' : 'table.colDel'));
      const rowBlocked = rowDeleteBlocked();
      setDisabled('row-del', rowBlocked, I18n.t(rowBlocked ? 'table.rowDelMerged' : 'table.rowDel'));
      syncDocumentMergeButtons();
      Caption.syncButton(button('caption'), editor, 'table');
      syncFillBar();
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  // Toolbar flottante d'image : zoom, taille d'origine, alignement, wrap, opacité, calque, suppression.
  function wireImageFloatingToolbar() {
    const html = [
      `<button data-action="zoom-out" title="${I18n.t('imgToolbar.shrink')}">${Icons.svg('zoomOut')}</button>`,
      `<button data-action="zoom-in" title="${I18n.t('imgToolbar.grow')}">${Icons.svg('zoomIn')}</button>`,
      `<button data-action="reset" title="${I18n.t('imgToolbar.originalSize')}">${Icons.svg('resetSize')}</button>`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="align-left" title="${I18n.t('align.left')}">${Icons.svg('alignLeft')}</button>`,
      `<button data-action="align-center" title="${I18n.t('align.center')}">${Icons.svg('alignCenter')}</button>`,
      `<button data-action="align-right" title="${I18n.t('align.right')}">${Icons.svg('alignRight')}</button>`,
      `<button data-action="wrap" title="${I18n.t('imgToolbar.inlineToggle')}">${Icons.svg('wrapToggle')}</button>`,
      '<span class="v2-floating-sep"></span>',
      `<input type="range" data-role="opacity" min="10" max="100" value="100" title="${I18n.t('imgToolbar.opacity')}">`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="layer-normal" title="${I18n.t('imgToolbar.inText')}">${Icons.svg('layerNormal')}</button>`,
      `<button data-action="layer-front" title="${I18n.t('imgToolbar.front')}">${Icons.svg('layerFront')}</button>`,
      `<button data-action="layer-behind" title="${I18n.t('imgToolbar.behind')}">${Icons.svg('layerBehind')}</button>`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="repeat" title="${I18n.t('imgToolbar.repeat')}" aria-pressed="false">${Icons.svg('layerRepeat')}</button>`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="caption" title="${I18n.t('caption.addImage')}" aria-label="${I18n.t('caption.addImage')}">${Icons.svg('caption')}</button>`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="delete" title="${I18n.t('imgToolbar.delete')}">${Icons.svg('trash')}</button>`,
    ].join('');

    const selectedImageNode = () => selectedNode('editorImage');

    // Dimensions intrinsèques (naturalWidth/Height) pour clampWidthForHfMaxSize.
    function selectedImageDom() {
      const dom = editor.view.nodeDOM(editor.state.selection.from);
      return (dom && dom.querySelector) ? dom.querySelector('img') : null;
    }

    function updateSelectedImage(patch) {
      const node = selectedImageNode();
      if (!node) return;
      EditorCore.patchNodeAndReselect(editor, editor.state.selection.from, Object.assign({}, node.attrs, patch));
    }

    // En flux normal, alignement classique ; en calque, réaligne sur le bord du conteneur (margin:auto n'a aucun effet en position:absolute).
    function alignOrSnap(align) {
      const node = selectedImageNode();
      if (!node) return;
      const { state } = editor;
      if (node.attrs.layer === 'normal') { updateSelectedImage({ align }); return; }
      const dom = editor.view.nodeDOM(state.selection.from);
      const img = dom && dom.querySelector && dom.querySelector('img');
      if (!img) return;
      // En pixels de mise en page, comme la largeur du conteneur : getBoundingClientRect est en pixels écran, plus petits que ceux de la page quand
      // la feuille est réduite (~0,85 à 700 px).
      const imgWidthPx = img.getBoundingClientRect().width / EditorCore.layoutZoom(img);
      const containerWidthPx = EditorCore.editorContentWidthPx(editor);
      // `left` est stocké depuis le bord de la boîte de padding, mais l'alignement vise le bord du texte - décalage explicite du padding.
      const rootCs = getComputedStyle(editor.view.dom);
      const padLeft = parseFloat(rootCs.paddingLeft) || 0;
      const left = align === 'left' ? padLeft : align === 'center' ? padLeft + Math.max(0, (containerWidthPx - imgWidthPx) / 2) : padLeft + Math.max(0, containerWidthPx - imgWidthPx);
      updateSelectedImage({ left: Math.round(left) });
      // dispatch() ci-dessus a déjà mis à jour le DOM de façon synchrone (NodeView applyAttrs) : `dom` reflète donc déjà la nouvelle position,
      // mesurable immédiatement pour la grille page (voir setLayer, même schéma).
      const grid = HeaderFooterPreview.computePageGridPosition(dom);
      // offsetLeft/offsetTop après computePageGridPosition, qui corrige `dom` si l'alignement sortait de la page physique ; rattrape aussi un `top`
      // déjà hors bornes, sans quoi il resterait stocké tel quel malgré la correction visuelle.
      if (grid) updateSelectedImage(Object.assign({ left: Math.round(dom.offsetLeft), top: Math.round(dom.offsetTop) }, grid));
    }

    // Chaque bouton fixe le calque visé (normal, devant, derrière). Au premier passage en calque, left/top partent de la position rendue : pas de
    // saut visuel.
    function setLayer(target) {
      const node = selectedImageNode();
      if (!node) return;
      const pos = editor.state.selection.from;
      if (node.attrs.layer === target) return;
      const patch = { layer: target };
      // « Sur toutes les pages » n'existe que derrière le texte (js/page-layer.js) : la case s'efface avec le calque.
      if (target !== 'behind') patch.repeat = false;
      if (target !== 'normal') {
        const dom = editor.view.nodeDOM(pos);
        const img = dom && dom.querySelector && dom.querySelector('img');
        if (img && (node.attrs.left == null || node.attrs.top == null)) {
          const imgRect = img.getBoundingClientRect();
          // offsetParent du wrapper (pas toujours .tiptap - une cellule de tableau en est un elle-même) : sinon l'image saute à l'affichage.
          const rootRect = (dom.offsetParent || editor.view.dom).getBoundingClientRect();
          // Écart mesuré en pixels écran, `left`/`top` s'écrivent en pixels de mise en page (feuille réduite à ~0,85 dans un panneau de ~700 px).
          const zoom = EditorCore.layoutZoom(img);
          patch.left = Math.round((imgRect.left - rootRect.left) / zoom);
          patch.top = Math.round((imgRect.top - rootRect.top) / zoom);
          // Reporté tout de suite sur `dom`, pas seulement sur `patch` (appliqué à la fin) : computePageGridPosition mesure et corrige `dom` lui-même
          // si cette position sort de la page physique, et la correction doit se retrouver dans le left/top enregistré.
          dom.style.position = 'absolute';
          dom.style.left = patch.left + 'px';
          dom.style.top = patch.top + 'px';
        }
        // Grille page (pageIndex/pageLeftPt/pageTopPt) : relue sur le rendu réel (Aperçu A4) à chaque passage en calque ; c'est elle, pas left/top,
        // que pdf-export.js utilise pour un rendu identique éditeur/PDF.
        if (dom) {
          const grid = HeaderFooterPreview.computePageGridPosition(dom);
          if (grid) {
            Object.assign(patch, grid);
            // offsetLeft/offsetTop après computePageGridPosition : la correction éventuelle y est reflétée. Seulement quand le bloc ci-dessus vient
            // de positionner `dom` (patch.left/top posés) ; pour un changement de calque ultérieur, `dom` n'est pas forcément en position:absolute au
            // bon endroit, et left/top restent ceux de node.attrs.
            if (patch.left != null && patch.top != null) {
              patch.left = Math.round(dom.offsetLeft);
              patch.top = Math.round(dom.offsetTop);
            }
          }
        }
      }
      EditorCore.patchNodeAndReselect(editor, pos, Object.assign({}, node.attrs, patch));
    }

    // Flèches du clavier sur une image en calque (devant ou derrière le texte) sélectionnée : 1 px de mise en page par appui, 10 px avec Maj, répété
    // quand la touche reste appuyée. Même chemin que le glisser de la NodeView (onMoveUp, js/editor-nodes.js) : `left`/`top` s'écrivent, puis la
    // grille page est relue sur le rendu pour que le PDF et le Word suivent.
    // Suivi des modifications actif, le déplacement laisse sa trace comme le glisser (EditorNodes.moveImageNode) : le premier appui d'une rafale
    // laisse l'original barré et pose la copie à sa nouvelle place, resélectionnée ; les appuis suivants déplacent cette copie sans empiler d'autres
    // traces.
    // Une image dans le texte et toute autre sélection gardent les flèches de ProseMirror. Une image que le curseur vient de sélectionner en arrivant
    // dessus (ProseMirror sélectionne un atome au lieu de le traverser) n'est pas visée non plus : la flèche suivante la traverse, sinon on ne
    // pourrait plus avancer dans le texte au clavier depuis l'ancre d'une image en calque (souvent le premier paragraphe) et la touche tenue ferait
    // glisser l'image sur la page. Un clic, une action de cette barre ou un glissé sont un choix : ils rendent les flèches à l'image.
    const ARROW_STEPS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const ARROW_STEP_PX = 1;
    const ARROW_BIG_STEP_PX = 10;
    let arrivedAtPos = null;
    let arrowInFlight = false;

    // Une image en suppression suggérée (l'original d'un déplacement suivi) n'est pas visée : elle ne bouge pas, la flèche garde son sens ordinaire.
    function selectedLayeredImage() {
      const node = selectedImageNode();
      return node && node.attrs.layer !== 'normal' && !node.marks.some(m => m.type.name === 'deletion') ? { node, pos: editor.state.selection.from } : null;
    }

    function nudgeSelectedImage(target, dx, dy) {
      const dom = editor.view.nodeDOM(target.pos);
      if (!dom || !dom.style) return;
      const before = target.node.attrs;
      const left0 = before.left || 0;
      const top0 = before.top || 0;
      // Posée d'abord sur le DOM : la grille page se mesure sur le rendu, comme au glisser. computePageGridPosition repousse l'image au bord de la
      // page physique si elle en sortait : `left`/`top` se relisent donc après, sur le style qu'elle corrige (offsetLeft compterait aussi la marge
      // d'une image habillée à gauche ou à droite).
      dom.style.left = (left0 + dx) + 'px';
      dom.style.top = (top0 + dy) + 'px';
      const grid = HeaderFooterPreview.computePageGridPosition(dom);
      const patch = { left: Math.round(parseFloat(dom.style.left) || 0), top: Math.round(parseFloat(dom.style.top) || 0) };
      if (grid) Object.assign(patch, grid);
      if (!EditorNodes.moveImageNode(editor, target.pos, patch)) {
        // Contre le bord de la page : la flèche est consommée mais rien ne s'écrit (ni modification du document, ni étape d'historique de plus, ni
        // trace en suivi).
        dom.style.left = left0 + 'px';
        dom.style.top = top0 + 'px';
      }
    }

    // Phase de capture : avant ProseMirror et ses raccourcis (curseur de passerelle, tableaux), qui prennent aussi les flèches ; un événement dont
    // preventDefault a été appelé n'est plus traité par ProseMirror.
    editor.view.dom.addEventListener('keydown', event => {
      const step = ARROW_STEPS[event.key];
      if (!step || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !editor.isEditable) return;
      const target = selectedLayeredImage();
      if (target && arrivedAtPos !== target.pos) {
        event.preventDefault();
        const size = event.shiftKey ? ARROW_BIG_STEP_PX : ARROW_STEP_PX;
        nudgeSelectedImage(target, step[0] * size, step[1] * size);
        return;
      }
      arrivedAtPos = null;
      // Rendue à ProseMirror : si sa flèche pose la sélection sur une image en calque, la transaction part pendant cet événement (cf. l'écoute de
      // 'transaction' plus bas).
      if (!target) { arrowInFlight = true; setTimeout(() => { arrowInFlight = false; }, 0); }
    }, true);
    editor.view.dom.addEventListener('mousedown', () => { arrivedAtPos = null; }, true);
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) arrivedAtPos = null;
      else if (arrowInFlight && transaction.selectionSet) {
        const arrived = selectedLayeredImage();
        arrivedAtPos = arrived ? arrived.pos : null;
      }
    });

    // « Sur toutes les pages » (js/page-layer.js) : la case de l'image « derrière le texte ». Il lui faut la place de la page (grille page), connue
    // dès que l'image a été positionnée dans l'Aperçu A4 ; une image plus ancienne la reçoit ici, mesurée sur le rendu comme au passage en calque.
    const a4PreviewOn = () => document.getElementById('editor-container').classList.contains('a4-preview');
    function repeatUnavailableReason(attrs) {
      if (attrs.layer !== 'behind') return 'imgToolbar.repeatNeedsBehind';
      if (HeaderFooterPreview.getHfMode() || GridEditor.isActive()) return 'imgToolbar.repeatNeedsBehind';
      if (!PageLayer.isRepeatedAttrs(Object.assign({}, attrs, { repeat: true })) && !a4PreviewOn()) return 'imgToolbar.repeatNeedsPage';
      return null;
    }
    function toggleRepeat() {
      const node = selectedImageNode();
      if (!node || repeatUnavailableReason(node.attrs)) return;
      if (node.attrs.repeat) { updateSelectedImage({ repeat: false }); return; }
      const patch = { repeat: true };
      if (!PageLayer.isRepeatedAttrs(Object.assign({}, node.attrs, { repeat: true }))) {
        const dom = editor.view.nodeDOM(editor.state.selection.from);
        const grid = dom && HeaderFooterPreview.computePageGridPosition(dom);
        if (!grid) return;
        Object.assign(patch, grid);
      }
      updateSelectedImage(patch);
    }

    // « Basculer en ligne / bloc » : « bloc » met l'image seule sur sa ligne, le texte d'avant finit sa ligne et celui d'après repart dessous, pareil
    // dans l'éditeur, la Lecture, le PDF et le Word ; « en ligne » la pose dans la ligne de texte. Rien à basculer pour une image seule dans son
    // paragraphe (aucun texte à séparer), une image alignée (gauche et droite flottent, le centre est toujours seul sur sa ligne) ni une image en
    // calque : le bouton est grisé, jamais retiré, et son info-bulle dit pourquoi. Autre contenu qui compte : du texte, un saut de ligne, une autre
    // image dans le flux, une bulle ; une image en calque ou un espace seul ne remplissent aucune ligne.
    function wrapUnavailableReason(node) {
      const attrs = node.attrs;
      if (attrs.layer && attrs.layer !== 'normal') return 'imgToolbar.wrapNeedsText';
      if (attrs.align) return 'imgToolbar.wrapNeedsText';
      const parent = editor.state.selection.$from.parent;
      let hasOtherContent = false;
      parent.forEach(child => {
        if (child === node) return;
        if (child.type.name === 'editorImage') { if (!child.attrs.layer || child.attrs.layer === 'normal') hasOtherContent = true; return; }
        if (child.isText) { if (child.text.trim()) hasOtherContent = true; return; }
        hasOtherContent = true;
      });
      return hasOtherContent ? null : 'imgToolbar.wrapNeedsText';
    }

    const panel = EditorCore.createFloatingPanel('v2-floating-toolbar', html, (action) => {
      const selNode = selectedImageNode();
      if (!selNode) return;
      const attrs = selNode.attrs;
      // Plafond en mode en-tête/pied (HeaderFooterPreview.clampWidthForHfMaxSize) : zoom avant et réinitialisation restent utilisables (les poignées
      // aussi, cf. startResize), bornés à la taille max, jamais bloqués ; zoom arrière ne fait que rétrécir.
      const clampedWidth = widthPx => {
        const dom = selectedImageDom();
        return dom ? HeaderFooterPreview.clampWidthForHfMaxSize(widthPx, dom.naturalWidth, dom.naturalHeight) : widthPx;
      };
      const commands = {
        'zoom-out': () => updateSelectedImage({ width: Math.round((parseFloat(attrs.width) || 320) * 0.75) + 'px' }),
        'zoom-in': () => updateSelectedImage({ width: Math.round(clampedWidth((parseFloat(attrs.width) || 320) * 1.25)) + 'px' }),
        reset: () => updateSelectedImage({ width: Math.round(clampedWidth(320)) + 'px', align: null }),
        'align-left': () => alignOrSnap('left'),
        'align-center': () => alignOrSnap('center'),
        'align-right': () => alignOrSnap('right'),
        wrap: () => { if (!wrapUnavailableReason(selNode)) updateSelectedImage({ wrap: attrs.wrap === 'block' ? 'inline' : 'block' }); },
        'layer-normal': () => setLayer('normal'),
        // Verrouillé en mode en-tête/pied (grisage : syncState), en plus du CSS pointer-events:none : pdf-export.js ne résout pas la position d'une
        // image en calque dans un en-tête ou un pied (pas de mesure en deux passes pour cette zone). Idem dans une grille (js/grid-editor.js) : une
        // image y est posée sur sa case, à sa taille, jamais en calque.
        'layer-front': () => { if (!HeaderFooterPreview.getHfMode() && !GridEditor.isActive()) setLayer('front'); },
        'layer-behind': () => { if (!HeaderFooterPreview.getHfMode() && !GridEditor.isActive()) setLayer('behind'); },
        repeat: toggleRepeat,
        // Légende (js/caption.js) : pose la légende sous l'image et y met le curseur, ou y ramène le curseur ; grisé (cf. syncState) pour une image
        // en calque ou habillée.
        caption: () => Caption.run(editor, 'image'),
        delete: () => {
          const pos = editor.state.selection.from;
          editor.chain().focus().deleteRange({ from: pos, to: pos + selNode.nodeSize }).run();
        },
      };
      (commands[action] || (() => {}))();
    }, (role, value) => {
      if (role === 'opacity') updateSelectedImage({ opacity: Math.max(0.1, parseInt(value, 10) / 100) });
    });

    const { button, setActive, setDisabled, setField } = controlsOf(panel);
    function syncState() {
      const node = selectedImageNode();
      if (!node) return;
      const attrs = node.attrs;
      const layer = attrs.layer || 'normal';
      setField('input[data-role="opacity"]', Math.round((attrs.opacity != null ? attrs.opacity : 1) * 100));
      ['left', 'center', 'right'].forEach(side => setActive('align-' + side, attrs.align === side));
      ['normal', 'front', 'behind'].forEach(name => setActive('layer-' + name, layer === name));
      // Grisés (jamais retirés) quand la bascule ne change rien, ou, pour les calques, quand pdf-export.js ne les résout pas (en-tête/pied, grille) ;
      // .v2-hf-locked : css/toolbar-v2.css.
      const wrapReason = wrapUnavailableReason(node);
      setActive('wrap', !wrapReason && attrs.wrap === 'block');
      setDisabled('wrap', wrapReason, I18n.t(wrapReason || 'imgToolbar.inlineToggle'));
      const layersLocked = !!HeaderFooterPreview.getHfMode() || GridEditor.isActive();
      ['layer-front', 'layer-behind'].forEach(action => {
        const btn = button(action);
        if (btn) btn.classList.toggle('v2-hf-locked', layersLocked);
      });
      // « Sur toutes les pages » : grisée tant que l'image n'est pas derrière le texte.
      const repeatReason = repeatUnavailableReason(attrs);
      setActive('repeat', !repeatReason && attrs.repeat);
      setDisabled('repeat', repeatReason, I18n.t(repeatReason || 'imgToolbar.repeat'));
      const repeatBtn = button('repeat');
      if (repeatBtn) repeatBtn.setAttribute('aria-pressed', !repeatReason && attrs.repeat ? 'true' : 'false');
      Caption.syncButton(button('caption'), editor, 'image');
    }

    // Sélection visuelle recalculée ici (pas via selectNode/deselectNode, peu fiable après un setNodeMarkup) : source de vérité unique.
    EditorCore.registerFloatingPanel(panel);
    const check = ({ transaction } = {}) => {
      // Le blur de l'éditeur (un clic ailleurs dans la page) est une transaction de plus, mais ne change ni la sélection ni le document : la traiter
      // rouvrirait la barre que le filet de editor-core.js vient de fermer (clic hors de .tiptap et hors de la barre).
      if (transaction && transaction.getMeta('blur')) return;
      // Pas de garde hasFocus() ici (contrairement à wireTableFloatingToolbar) : le panneau contient un vrai contrôle de formulaire (le curseur
      // d'opacité), voir wireVariableFloatingToolbar pour le détail. La fermeture au clic hors du panneau est gérée par hideFloatingContextToolbars
      // (js/editor-core.js) ; ici, seule la sélection décide.
      document.querySelectorAll('.tiptap .editor-image-view.editor-image-selected').forEach(el => el.classList.remove('editor-image-selected'));
      if (!selectedImageNode()) { panel.hide(); return; }
      const dom = editor.view.nodeDOM(editor.state.selection.from);
      const img = dom && dom.querySelector && dom.querySelector('img');
      if (!img) { panel.hide(); return; }
      dom.classList.add('editor-image-selected');
      syncState();
      panel.show(img, GridEditor.floatingOptions);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  // Barre flottante d'une bulle #Variable (même modèle que l'image), ouverte sur toutes les variables : un groupe d'actions à gauche (condition
  // d'affichage, autres attributs de la même ligne, boucle sur les lignes liées, liste des valeurs d'une colonne Liste de choix ou de références,
  // et, seulement sur une variable cassée, le choix d'une autre colonne), puis, pour une colonne nombre, date ou Oui / Non seulement, le
  // sous-panneau de format choisi par le type de la colonne Grist (Oui /
  // Non : trois cases et « vrai / faux »). Une bulle « Calcul » (js/variable-calc.js) ouvre la même barre : « Modifier le calcul » prend la place du
  // groupe d'actions (condition, autres attributs et boucle sont grisés, sans objet pour une formule), avec le réglage nombre puisque son résultat
  // est un nombre.
  function wireVariableFloatingToolbar() {
    const dateOptions = VariableFormat.DATE_PRESETS.map(p => `<option value="${p.key}">${VariableFormat.presetLabel(p)}</option>`).join('');
    const html = [
      '<div class="v2-varbadge-actions">',
      `<button data-action="calc-edit" title="${I18n.t('varToolbar.calcEdit')}" aria-label="${I18n.t('varToolbar.calcEdit')}" hidden>${Icons.svg('calc')}</button>`,
      `<button data-action="var-condition" title="${I18n.t('varToolbar.condition')}" aria-label="${I18n.t('varToolbar.condition')}">${Icons.svg('varCondition')}</button>`,
      `<button data-action="var-linked" title="${I18n.t('varToolbar.linked')}" aria-label="${I18n.t('varToolbar.linked')}">${Icons.svg('varLinked')}</button>`,
      `<button data-action="var-loop" title="${I18n.t('varToolbar.loop')}" aria-label="${I18n.t('varToolbar.loop')}">${Icons.svg('varLoop')}</button>`,
      `<button data-action="var-list" title="${I18n.t('varToolbar.list')}" aria-label="${I18n.t('varToolbar.list')}">${Icons.svg('varList')}</button>`,
      `<button data-action="var-column" title="${I18n.t('varToolbar.columnBroken')}" aria-label="${I18n.t('varToolbar.columnBroken')}" hidden>${Icons.svg('varColumn')}</button>`,
      '</div>',
      '<span class="v2-floating-sep" data-var-sep></span>',
      '<div data-var-panel="number">',
      '<span class="v2-varfmt-seg">',
      `<button data-action="num-style:fr" title="${I18n.t('varFmt.styleFr')}">FR</button>`,
      `<button data-action="num-style:us" title="${I18n.t('varFmt.styleUs')}">US</button>`,
      `<button data-action="num-style:none" title="${I18n.t('varFmt.styleNone')}">—</button>`,
      '</span>',
      `<select data-role="num-decimals" title="${I18n.t('varFmt.decimals')}"><option value="">${I18n.t('varFmt.decimalsAuto')}</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>`,
      `<input type="text" data-role="num-currency" placeholder="${I18n.t('varFmt.currencyPlaceholder')}" title="${I18n.t('varFmt.currencyTitle')}" maxlength="6">`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="num-words" title="${I18n.t('varFmt.wordsNumberTitle')}">${I18n.t('varFmt.wordsButton')}</button>`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="num-zero" title="${I18n.t('varFmt.zero')}" aria-label="${I18n.t('varFmt.zero')}" aria-pressed="true">${Icons.svg('zeroToggle')}</button>`,
      '</div>',
      '<div data-var-panel="date" hidden>',
      '<span class="v2-varfmt-seg">',
      `<button data-action="date-part:day" title="${I18n.t('varFmt.showDay')}">J</button>`,
      `<button data-action="date-part:month" title="${I18n.t('varFmt.showMonth')}">M</button>`,
      `<button data-action="date-part:year" title="${I18n.t('varFmt.showYear')}">A</button>`,
      '</span>',
      `<select data-role="date-preset" title="${I18n.t('varFmt.datePreset')}">${dateOptions}</select>`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="date-words" title="${I18n.t('varFmt.wordsDateTitle')}">${I18n.t('varFmt.wordsButton')}</button>`,
      '</div>',
      // Colonne Oui / Non : les trois cases de la liste à cases (mêmes icônes, mêmes noms) puis le texte « vrai / faux ». Libellés et infobulles
      // réécrits par syncState (langue en cours).
      '<div data-var-panel="bool" hidden>',
      '<span class="v2-varfmt-seg">',
      VariableFormat.BOOL_CHECKBOX_STYLES.map(style => `<button data-action="bool-style:${style}">${Icons.svg('checklist' + style.charAt(0).toUpperCase() + style.slice(1))}</button>`).join(''),
      '<button data-action="bool-style:text"></button>',
      '</span>',
      '</div>',
    ].join('');
    const panel = EditorCore.createFloatingPanel('v2-floating-toolbar v2-varfmt-toolbar', html, onAction, onInput);
    EditorCore.registerFloatingPanel(panel);
    const { button, setActive, setDisabled, setField } = controlsOf(panel);
    const section = name => panel.el.querySelector(`[data-var-panel="${name}"]`);

    // Ce que la barre règle, d'après la sélection : une bulle (`badge`, variable) ou un `calc`, un bloc de texte conditionnel (`block`, clic sur son
    // étiquette), une case conditionnelle (`checkbox`, clic sur sa puce) ou une valeur conditionnelle (`value` : le curseur dans son texte, ou la
    // valeur sélectionnée en entier ; une sélection qui déborde ne l'ouvre pas). { kind, node, pos } ou null. Un seul cas à la fois : un nœud
    // sélectionné n'a qu'un type, et le curseur ne désigne une valeur que sans nœud sélectionné.
    const NODE_KINDS = { varBadge: 'badge', calcBadge: 'calc', conditionalText: 'block', conditionalCheckbox: 'checkbox', conditionalValue: 'value' };
    const isFormatKind = kind => kind === 'badge' || kind === 'calc';
    function target() {
      const { selection } = editor.state;
      if (selection.node) {
        const kind = selection.node.type && NODE_KINDS[selection.node.type.name];
        return kind ? { kind, node: selection.node, pos: selection.from } : null;
      }
      const { $from, $to } = selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === 'conditionalValue') return ($to.depth >= depth && $to.node(depth) === node) ? { kind: 'value', node, pos: $from.before(depth) } : null;
      }
      return null;
    }
    // Le type de colonne d'un calcul est « Numérique » : son résultat est un nombre, écrit et caché à zéro comme celui d'une colonne Numérique
    // (Variables.resolveCalcResult).
    function columnTypeOf(node) { return node.type.name === 'calcBadge' ? 'Numeric' : GristAPI.getColumnType(node.attrs.table, node.attrs.column); }

    // Les fenêtres des boutons de gauche, ouvertes sur la bulle sélectionnée ; position capturée au clic, la fenêtre retire ensuite le focus de
    // l'éditeur. Un bouton grisé (cf. syncState) ne fait rien. « Autres attributs » : variable d'une autre table (déjà liée à l'insertion) ou colonne
    // Référence de la table de la page, règle tenue par js/variable-linked-attrs.js.
    const WINDOWS = {
      'var-condition': (node, pos) => VariableCondition.open(editor, pos),
      'var-linked': (node, pos) => { if (VariableLinkedAttrs.isAvailable(node.attrs)) VariableLinkedAttrs.open(editor, pos); },
      'var-loop': (node, pos) => { if (VariableLoop.status(editor, pos, node).enabled) VariableLoop.open(editor, pos); },
      'var-list': (node, pos) => { if (VariableList.status(node).enabled) VariableList.open(editor, pos); },
      'var-column': (node, pos) => VariableColumn.open(editor, pos),
    };
    // Le format d'une bulle ou d'un calcul : `setFormat` le remplace (null = format vide), `patchFormat` fusionne dans l'existant.
    const setFormat = ({ node, pos }, format) => EditorCore.patchNodeAndReselect(editor, pos, Object.assign({}, node.attrs, { format }));
    const patchFormat = (t, patch) => setFormat(t, Object.assign({}, t.node.attrs.format, patch));
    function applyFormat(t, action) {
      const [name, arg] = action.split(':');
      const format = t.node.attrs.format || {};
      switch (name) {
        case 'num-style': patchFormat(t, { type: 'number', style: arg }); break;
        // Enfoncé (0 barré), le zéro ne s'écrit pas - c'est l'écriture par défaut -, relâché la bulle l'affiche (`zero: 'show'`). Sans `type:
        // 'number'`, pour ne pas poser de style à la place de celui que la barre annonce déjà (FR, ou US en interface anglaise) ; revenir à
        // l'écriture par défaut retire la clé, et une bulle sans autre réglage retrouve un format vide.
        case 'num-zero': {
          const next = Object.assign({}, format);
          if (Variables.zeroHidden(format, columnTypeOf(t.node))) next.zero = 'show'; else delete next.zero;
          setFormat(t, Object.keys(next).length ? next : null);
          break;
        }
        case 'num-words': patchFormat(t, { type: 'number', words: !format.words }); break;
        // Le dernier composant J/M/A actif ne peut pas être désactivé (date vide sinon).
        case 'date-part': {
          const active = ['day', 'month', 'year'].filter(part => format[part] !== false);
          if (active.length === 1 && active[0] === arg) break;
          patchFormat(t, { type: 'date', [arg]: format[arg] === false });
          break;
        }
        case 'date-words': patchFormat(t, { type: 'date', words: !format.words }); break;
        // Oui / Non : le style remplace tout le format (une colonne passée de nombre à Oui / Non ne garde pas ses décimales). « vrai / faux » est
        // l'écriture par défaut : la choisir retire le réglage, la bulle retrouve un format vide (sans le point bleu d'une bulle réglée), comme le
        // bouton du zéro d'un nombre.
        case 'bool-style':
          if (arg === 'text') setFormat(t, null);
          else if (VariableFormat.isCheckboxStyle(arg)) setFormat(t, { type: 'bool', style: arg });
          break;
      }
    }
    function onAction(action) {
      const t = target();
      if (!t) return;
      const { kind, node, pos } = t;
      if (action === 'calc-edit') { if (kind === 'calc') VariableCalc.openAt(editor, pos); return; }
      const open = WINDOWS[action];
      if (open) {
        // Un bloc, une valeur et une case n'ont que la condition ; un calcul aucun de ces boutons (grisés par syncState).
        if (kind === 'badge' || (kind !== 'calc' && action === 'var-condition')) open(node, pos);
      } else if (kind === 'checkbox') {
        if (action.indexOf('bool-style:') === 0 && VariableFormat.isCheckboxStyle(action.slice(11))) {
          EditorCore.patchNodeAndReselect(editor, pos, Object.assign({}, node.attrs, { style: action.slice(11) }));
        }
      } else if (isFormatKind(kind)) {
        applyFormat(t, action);
      }
    }
    function onInput(role, value) {
      const t = target();
      if (!t || !isFormatKind(t.kind)) return;
      if (role === 'num-decimals') patchFormat(t, { type: 'number', decimals: value === '' ? null : parseInt(value, 10) });
      else if (role === 'num-currency') patchFormat(t, { type: 'number', currency: value.trim() });
      else if (role === 'date-preset') patchFormat(t, { type: 'date', preset: value });
    }

    // Bouton grisé ou actif dont le nom accessible suit l'info-bulle.
    function setLabeled(action, disabled, title) {
      setDisabled(action, disabled, title);
      const btn = button(action);
      if (btn) btn.setAttribute('aria-label', title);
    }
    // Bouton sans objet pour la sélection : grisé (jamais retiré) et éteint, sa raison en info-bulle.
    function greyOut(action, reasonKey) {
      setDisabled(action, true, I18n.t(reasonKey));
      setActive(action, false);
    }
    // « Colonne… » : là seulement sur une variable cassée (la bulle rouge : colonne, chemin ou table disparus dans Grist), pour y choisir la bonne
    // colonne ; absente - cachée, pas grisée : demande expresse, exception à « rien ne disparaît » - d'une variable saine, d'un calcul (même cassé),
    // d'un bloc de texte, d'une valeur et d'une case conditionnelle. Relue à chaque ouverture de la barre : une variable réparée la perd.
    function syncColumnButton(node) {
      const btn = button('var-column');
      if (!btn) return;
      const broken = node.type.name === 'varBadge' && VariableColumn.isBroken(node.attrs);
      btn.hidden = !broken;
      if (broken) setLabeled('var-column', false, I18n.t('varToolbar.columnBroken'));
    }
    // « Liste… » : active (bleue) quand la bulle a un réglage de liste, grisée pour une colonne qui n'est pas une liste, une bulle en boucle, un
    // calcul, un bloc de texte, une valeur et une case conditionnelle, avec sa raison en info-bulle. `status` : { active, enabled, title }, comme
    // VariableList.status.
    function syncListButton(status) {
      setLabeled('var-list', !status.enabled, status.title);
      setActive('var-list', status.active);
    }
    // La condition garde son nom d'origine pour une bulle et un bloc ; une case conditionnelle dit « cochée si… » (une condition d'affichage n'aurait
    // pas de sens pour elle). `reasonKey` : grisée avec cette raison (un calcul).
    function syncConditionButton(node, labelKey, reasonKey) {
      const btn = button('var-condition');
      if (!btn) return;
      btn.setAttribute('aria-label', I18n.t(labelKey));
      setDisabled('var-condition', !!reasonKey, I18n.t(reasonKey || labelKey));
      setActive('var-condition', !reasonKey && !!ConditionRules.normalizeCondition(node.attrs.condition));
    }
    // « Modifier le calcul » n'est là que pour un calcul : un calcul choisi juste avant l'a montré, l'autre sélection le cache.
    function showCalcEdit(shown) {
      const btn = button('calc-edit');
      if (btn) btn.hidden = !shown;
    }

    // Un bloc de texte conditionnel, une valeur et une case ont la même barre : seuls le nom de la condition et les raisons des boutons grisés
    // changent (clés de js/i18n.js).
    const REASONS = {
      block: { condition: 'varToolbar.condition', linked: 'varToolbar.linkedBlock', loop: 'varToolbar.loopBlock', list: 'varToolbar.listBlock' },
      value: { condition: 'varToolbar.condition', linked: 'varToolbar.notForValue', loop: 'varToolbar.loopValue', list: 'varToolbar.notForValue' },
      checkbox: { condition: 'varToolbar.conditionCheckbox', linked: 'varToolbar.linkedCheckbox', loop: 'varToolbar.loopCheckbox', list: 'varToolbar.listCheckbox' },
    };
    function syncConditionalState(node, why) {
      syncConditionButton(node, why.condition);
      showCalcEdit(false);
      greyOut('var-linked', why.linked);
      greyOut('var-loop', why.loop);
      syncListButton({ active: false, enabled: false, title: I18n.t(why.list) });
      syncColumnButton(node);
    }

    // Les boutons des styles de case : celui du style en cours est allumé et enfoncé. « vrai / faux » (`text`) est le style d'une bulle sans
    // réglage ; une case conditionnelle n'a pas ce bouton. Libellés et infobulles relus à chaque ouverture : la langue de l'interface a pu changer
    // depuis la création de la barre.
    function syncBoolButtons(currentStyle) {
      const boolTitles = { accentStrike: 'varFmt.boolAccentStrike', classic: 'list.checklistClassic.tip', accentPlain: 'list.checklistAccentPlain.tip', text: 'varFmt.boolTextTitle' };
      Object.keys(boolTitles).forEach(style => {
        const btn = button(`bool-style:${style}`);
        if (!btn) return;
        btn.classList.toggle('is-active', style === currentStyle);
        btn.title = I18n.t(boolTitles[style]);
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-pressed', style === currentStyle ? 'true' : 'false');
        if (style === 'text') btn.textContent = I18n.t('varFmt.boolTextButton');
      });
    }

    // Une variable ou un calcul : la condition, les boutons de gauche et le sous-panneau de format que choisit le type de la colonne.
    function syncState(node, pos) {
      const isCalc = node.type.name === 'calcBadge';
      const format = node.attrs.format || {};
      const isNumber = format.type === 'number';
      const isDate = format.type === 'date';
      showCalcEdit(isCalc);
      syncConditionButton(node, 'varToolbar.condition', isCalc ? 'varToolbar.notForCalc' : null);
      syncColumnButton(node);
      if (isCalc) {
        // Un calcul n'a ni autre attribut de sa ligne ni boucle : les deux boutons restent à leur place, grisés, avec leur raison en info-bulle.
        greyOut('var-linked', 'varToolbar.notForCalc');
        greyOut('var-loop', 'varToolbar.notForCalc');
        syncListButton({ active: false, enabled: false, title: I18n.t('varToolbar.notForCalc') });
      } else {
        syncListButton(VariableList.status(node));
        const linked = VariableLinkedAttrs.isAvailable(node.attrs);
        setDisabled('var-linked', !linked, I18n.t(linked ? 'varToolbar.linked' : 'varToolbar.linkedDisabled'));
        // Boucle : active (bleue) quand posée ; grisée pour une variable qui ne montre qu'une ligne, ou déjà répétée avec une autre bulle
        // (js/variable-loop.js).
        const loop = VariableLoop.status(editor, pos, node);
        setActive('var-loop', loop.active);
        setDisabled('var-loop', !loop.enabled, loop.title);
      }
      // Repli aligné sur la langue de l'interface, sauf si un style explicite est déjà posé.
      const defaultStyle = I18n.getLang() === 'en' ? 'us' : 'fr';
      const style = isNumber ? (format.style || defaultStyle) : defaultStyle;
      ['fr', 'us', 'none'].forEach(name => setActive('num-style:' + name, style === name));
      setActive('num-words', isNumber && format.words);
      section('number').classList.toggle('v2-varfmt-words-active', isNumber && !!format.words);
      setField('select[data-role="num-decimals"]', isNumber && format.decimals != null ? String(format.decimals) : '');
      setField('input[data-role="num-currency"]', isNumber && format.currency ? format.currency : '');
      // Même règle que le rendu (Variables.zeroHidden) : la barre montre ce que le document écrit - bouton enfoncé et 0 barré tant que le zéro ne
      // s'écrit pas. Le trait du 0 se cache par son attribut `display` : remplacer le SVG pendant le mousedown détacherait la cible du clic, que le
      // filet de editor-core.js (clic hors de la barre = on ferme) prendrait pour un clic ailleurs.
      const zeroBtn = button('num-zero');
      if (zeroBtn) {
        const zeroOff = Variables.zeroHidden(format, columnTypeOf(node));
        setActive('num-zero', zeroOff);
        zeroBtn.setAttribute('aria-pressed', zeroOff ? 'true' : 'false');
        const slash = zeroBtn.querySelector('svg path');
        if (slash) slash.setAttribute('display', zeroOff ? 'inline' : 'none');
      }
      setField('select[data-role="date-preset"]', isDate && format.preset ? format.preset : VariableFormat.DATE_PRESETS[0].key);
      ['day', 'month', 'year'].forEach(part => setActive('date-part:' + part, !isDate || format[part] !== false));
      setActive('date-words', isDate && format.words);
      // Oui / Non : le style en cours est allumé, « vrai / faux » tant que rien n'est réglé (c'est ce que la bulle écrit).
      syncBoolButtons(VariableFormat.boolStyle(format));
    }

    const check = ({ transaction } = {}) => {
      // Le blur de l'éditeur est ignoré : cf. wireImageFloatingToolbar.
      if (transaction && transaction.getMeta('blur')) return;
      // Pas de garde hasFocus() ni document.activeElement ici : le panneau contient de vrais contrôles de formulaire (nombre de décimales, format de
      // date, devise). Cliquer dessus déplace le focus hors de l'éditeur (editor.view.hasFocus() devient faux), mais un <select> ne reçoit pas
      // toujours le focus de façon fiable ni synchrone : contrôler `panel.el.contains(document.activeElement)` fermait la barre au moment où la liste
      // native s'ouvrait. La fermeture au clic hors du panneau est gérée par hideFloatingContextToolbars (js/editor-core.js), sur la cible du
      // mousedown, fiable y compris pour un <select> ; ici, seule la sélection décide.
      const t = target();
      if (!t) { panel.hide(); return; }
      // Une fenêtre (condition, autres attributs, boucle, liste, calcul) est ouverte sur cette bulle : la barre reste masquée tant qu'elle l'est ;
      // son niveau, sous les fenêtres, la cacherait de toute façon derrière le voile.
      if (VariableCondition.isOpen() || VariableLinkedAttrs.isOpen() || VariableLoop.isOpen() || VariableList.isOpen() || VariableCalc.isOpen()) { panel.hide(); return; }
      const { kind, node, pos } = t;
      const type = isFormatKind(kind) ? columnTypeOf(node) : null;
      const isNumber = type === 'Numeric' || type === 'Int';
      const isDate = type === 'Date' || type === 'DateTime';
      // Les trois cases : une colonne Oui / Non, et la case conditionnelle - dont la barre n'a pas « vrai / faux », elle est toujours une case.
      const isBool = type === 'Bool' || kind === 'checkbox';
      section('number').hidden = !isNumber;
      section('date').hidden = !isDate;
      section('bool').hidden = !isBool;
      const textButton = button('bool-style:text');
      if (textButton) textButton.hidden = kind === 'checkbox';
      panel.el.querySelector('[data-var-sep]').hidden = !isNumber && !isDate && !isBool;
      const dom = editor.view.nodeDOM(pos);
      // Éditeur masqué (Lecture, résumé d'un macro-modèle) : la bulle reste sélectionnée mais n'a plus de boîte, et floating-ui poserait la barre en
      // haut à gauche (8, 8) - une transaction qui arrive alors (le blur de l'éditeur à un clic sur « Lecture », par exemple) ne doit pas la rouvrir.
      if (!dom || !dom.getClientRects().length) { panel.hide(); return; }
      if (isFormatKind(kind)) syncState(node, pos);
      else syncConditionalState(node, REASONS[kind]);
      if (kind === 'checkbox') syncBoolButtons(ConditionalCheckbox.styleOf(node.attrs.style));
      // Un bloc de texte conditionnel : la barre s'ancre sur son étiquette (en haut à gauche), pas au milieu de sa largeur.
      panel.show(kind === 'block' ? (dom.querySelector && dom.querySelector(':scope > .conditional-text-tag')) || dom : dom, GridEditor.floatingOptions);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  // Barre flottante d'une modification suivie : « Accepter » et « Refuser » ne traitent que celle sur laquelle on a cliqué (ou celles que la
  // sélection recouvre), « Tout accepter » et « Tout refuser » restant dans la barre du haut. Elle s'ouvre sous le curseur - au-dessus, elle
  // recouvrirait la barre du tableau, de l'image ou de la bulle que le même clic peut ouvrir - et jamais pendant la frappe : taper au bout d'une
  // suggestion ne doit pas la rouvrir à chaque lettre, elle attend un vrai déplacement de la sélection (ou un clic). Pendant un glisser à la souris
  // elle attend le relâchement.
  function wireSuggestionFloatingToolbar(authors) {
    // Qui a proposé la modification vient APRÈS les boutons : l'identité de la personne se lit une fois, à l'ouverture de la barre, et son étiquette arrive un instant plus tard ;
    // devant les boutons, elle les décalerait sous la souris.
    const html = ['accept', 'reject'].map((name) => {
      const key = 'trackChanges.' + name + '.label';
      return `<button data-action="${name}" data-i18n="${key}">${I18n.t(key)}</button>`;
    }).join('') + '<span class="v2-suggest-author" hidden></span>';
    const panel = EditorCore.createFloatingPanel('v2-floating-toolbar v2-suggest-toolbar', html, (action) => {
      const chain = editor.chain().focus();
      (action === 'accept' ? chain.acceptSuggestionsAtSelection() : chain.rejectSuggestionsAtSelection()).run();
      panel.hide();
    });
    EditorCore.registerFloatingPanel(panel);
    // L'étiquette « Proposé par Marie Curie » : le nom de la personne (son adresse à défaut de nom), « et 2 autres » quand la sélection couvre des modifications de
    // plusieurs personnes ; son info-bulle les donne toutes, avec leur adresse. Vide et masquée quand aucune des modifications n'a d'auteur connu (le contenu de la barre est alors
    // celui d'avant). Un clic dessus ne fait rien et ne prend pas le focus de l'éditeur.
    const authorLabel = panel.el.querySelector('.v2-suggest-author');
    authorLabel.addEventListener('mousedown', (event) => event.preventDefault());
    let shownIds = [];
    const showAuthors = () => {
      const people = authors ? authors.of(shownIds) : [];
      const names = people.map((p) => p.name || p.email);
      if (!names.length) {
        authorLabel.hidden = true;
        authorLabel.textContent = '';
        authorLabel.removeAttribute('title');
        return;
      }
      // `n` avant `name` : le texte d'un nom n'est jamais relu comme une variable (I18n.t).
      authorLabel.textContent = names.length === 1
        ? I18n.t('trackChanges.proposedBy.one', { name: names[0] })
        : I18n.t('trackChanges.proposedBy.many', { n: names.length - 1, name: names[0] });
      authorLabel.title = I18n.t('trackChanges.proposedBy.one', { name: people.map((p) => (p.name && p.email ? p.name + ' (' + p.email + ')' : (p.name || p.email))).join(', ') });
      authorLabel.hidden = false;
    };
    if (authors) authors.onChange(() => { if (panel.el.classList.contains('visible')) showAuthors(); });
    I18n.onChange(showAuthors);
    // Fermée après une modification du document (frappe, résolution, Annuler) jusqu'au prochain déplacement de la sélection ou clic ; fermée aussi
    // tant qu'un bouton de la souris est appuyé dans le texte.
    let suppressed = false;
    let pointerDown = false;
    // Le point d'ancrage : un nœud sélectionné (image, tableau supprimé en entier) porte la barre sous lui, sinon le curseur (le bout de la
    // sélection, là où l'on a cliqué), relu à chaque calcul de floating-ui.
    let lastRect = null;
    const caretAnchor = {
      get contextElement() { return editor.view.dom; },
      getBoundingClientRect() {
        try {
          const c = editor.view.coordsAtPos(editor.state.selection.head);
          lastRect = { x: c.left, y: c.top, width: 0, height: c.bottom - c.top, top: c.top, bottom: c.bottom, left: c.left, right: c.left };
        } catch (e) { /* position hors du document le temps d'une transaction : le dernier rectangle connu */ }
        return lastRect || { x: 0, y: 0, width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 };
      },
    };
    const options = () => Object.assign({ placement: 'bottom-start' }, GridEditor.floatingOptions());
    const check = ({ transaction } = {}) => {
      // Le blur de l'éditeur est ignoré : cf. wireImageFloatingToolbar.
      if (transaction && transaction.getMeta('blur')) return;
      if (transaction && transaction.docChanged) suppressed = true;
      else if (transaction && transaction.selectionSet) suppressed = false;
      // Pas de focus dans l'éditeur (la recherche, une fenêtre) : la sélection peut bouger sans que la personne regarde le texte. Aucun champ de
      // formulaire dans cette barre, ses boutons gardent le focus de l'éditeur (mousedown + preventDefault, js/editor-core.js) : la garde est sûre.
      if (suppressed || pointerDown || !editor.isEditable || !editor.view.hasFocus()) { panel.hide(); return; }
      // Éditeur masqué (Lecture, résumé d'un macro-modèle) : cf. wireVariableFloatingToolbar.
      if (!editor.view.dom.getClientRects().length) { panel.hide(); return; }
      const ids = TrackChanges.selectionSuggestionIds(editor.state);
      if (!ids.length) { panel.hide(); return; }
      panel.el.querySelectorAll('button[data-action]').forEach((btn) => {
        btn.title = I18n.t('trackChanges.' + btn.dataset.action + '.tip', { n: ids.length });
      });
      shownIds = ids;
      showAuthors();
      const dom = editor.state.selection.node ? editor.view.nodeDOM(editor.state.selection.from) : null;
      panel.show(dom && dom.getClientRects && dom.getClientRects().length ? dom : caretAnchor, options);
    };
    editor.on('transaction', check);
    // Un clic est un geste voulu même quand il ne change pas la sélection (rester au bout du texte qu'on vient de taper) : il lève la fermeture due à
    // la frappe, et la barre s'ouvre au relâchement, une fois la sélection posée.
    editor.view.dom.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      pointerDown = true;
      suppressed = false;
    }, true);
    document.addEventListener('mouseup', () => {
      if (!pointerDown) return;
      pointerDown = false;
      setTimeout(check, 0);
    }, true);
  }

  return { setEditor, wireColorPickers, wireTableFloatingToolbar, wireImageFloatingToolbar, wireVariableFloatingToolbar, wireSuggestionFloatingToolbar };
})();
