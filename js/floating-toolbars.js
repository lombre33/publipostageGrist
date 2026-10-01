// Toolbars contextuelles flottantes (couleur/surlignage, tableau, image, variable) - extrait de editor.js (découpage 2026). Chacune ferme directement sur sa
// propre référence d'éditeur (posée une fois via setEditor(), appelé depuis Editor.init()) : contrairement aux fabriques de nœuds (editor-nodes.js), ces
// fonctions sont câblées une seule fois et leurs gestionnaires d'évènements ont besoin de retrouver l'éditeur bien après leur mise en place.
const FloatingToolbars = (function () {
  let editor = null;
  function setEditor(ed) { editor = ed; }

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

  // Grille de nuances + case "personnalisé"/"aucune", partagée entre police, surlignage et fond de cellule. `onPick`/`onNone` reçoivent une chaîne déjà
  // focus+sélection restaurée et ne doivent jamais appeler .run() eux-mêmes.
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

  // Menu « Bordures » d'une grille (css/grid.css) : une rangée de réglages en icônes, puis la couleur du stylo - la grille de nuances et le pied « personnalisé » / « par défaut » du menu de
  // couleur ci-dessus, sans refermer le menu au choix d'une couleur. `onPreset(preset)` et `onPen(color | null)` ne touchent pas à l'éditeur eux-mêmes.
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
    // "Aucune couleur" appliquée n'est jamais mémorisée comme "dernier choix" - un clic rapide sur l'icône doit toujours appliquer une VRAIE couleur.
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
    // Ce que seule une grille a (js/grid-editor.js) : fusion, alignement vertical. Posé dans la barre pour tous les tableaux, montré par css/grid.css sous `body.pp-grid-mode` seulement :
    // la barre d'un tableau de document reste celle d'avant.
    const VALIGN_BUTTONS = [['valign-top', 'valignTop', 'top', I18n.t('table.valignTop')], ['valign-middle', 'valignMiddle', 'middle', I18n.t('table.valignMiddle')], ['valign-bottom', 'valignBottom', 'bottom', I18n.t('table.valignBottom')]];
    // Menu « Bordures » d'une grille : les huit réglages (icône, info-bulle) ; la couleur du stylo (null = le trait de départ) se choisit une fois et reste pour les réglages suivants.
    const BORDER_PRESETS = [['all', 'bordersAll', I18n.t('table.bordersAll')], ['outer', 'bordersOuter', I18n.t('table.bordersOuter')], ['inner', 'bordersInner', I18n.t('table.bordersInner')],
      ['top', 'bordersTop', I18n.t('table.bordersTop')], ['bottom', 'bordersBottom', I18n.t('table.bordersBottom')], ['left', 'bordersLeft', I18n.t('table.bordersLeft')],
      ['right', 'bordersRight', I18n.t('table.bordersRight')], ['none', 'bordersNone', I18n.t('table.bordersNone')]];
    let penColor = null;
    // Les menus de la barre d'une grille (fond, bordures) s'ouvrent SOUS la bande où elle est fixée : au-dessus, ils recouvriraient la barre d'outils.
    const menuPlacement = () => (GridEditor.isActive() ? { placement: 'bottom-start' } : undefined);
    const gridButton = (action, icon, title) => `<button data-action="${action}" class="v2-grid-only" title="${title}">${Icons.svg(icon)}</button>`;
    const html = buttons.map(([action, icon, title]) =>
      `<button data-action="${action}" title="${title}">${Icons.svg(icon)}</button>`).join('')
      + '<span class="v2-floating-sep v2-grid-only"></span>'
      + gridButton('cell-merge', 'cellMerge', I18n.t('table.cellMerge'))
      + gridButton('cell-split', 'cellSplit', I18n.t('table.cellSplit'))
      + '<span class="v2-floating-sep"></span>'
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
        'cell-merge': () => GridEditor.mergeCells(editor),
        'cell-split': () => GridEditor.splitCell(editor),
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
    // Menu « Bordures » : un réglage pose la couleur du stylo sur les traits qu'il vise (une seule transaction, un seul Annuler) et referme le menu ; une couleur se choisit sans le refermer.
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
    // Boutons d'une grille selon la sélection : « Fusionner » et « Scinder » grisés quand ils n'ont pas de sens (jamais retirés), l'alignement vertical des cases visées enfoncé
    // (aucun quand la sélection mêle plusieurs alignements).
    const gridButtonOf = action => panel.el.querySelector(`button[data-action="${action}"]`);
    const setLocked = (action, locked) => {
      const btn = gridButtonOf(action);
      if (!btn) return;
      btn.classList.toggle('v2-hf-locked', locked);
      btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
    };
    const syncGridButtons = () => {
      setLocked('table-del', true);
      setLocked('cell-merge', !GridEditor.canMerge(editor));
      setLocked('cell-split', !GridEditor.canSplit(editor));
      const align = GridEditor.selectedVerticalAlign(editor);
      VALIGN_BUTTONS.forEach(([action, , value]) => {
        const btn = gridButtonOf(action);
        if (!btn) return;
        btn.classList.toggle('is-active', align === value);
        btn.setAttribute('aria-pressed', align === value ? 'true' : 'false');
      });
    };
    const check = () => {
      // Une grille (js/grid-editor.js) : la barre est fixée dans sa bande au-dessus du tableau (css/grid.css) et y reste, focus ou non - posée sur la case courante elle
      // recouvrait les cases voisines (un appui dessus tombait sur ses boutons, rien ne se sélectionnait à la souris). « Supprimer le tableau » est grisé (le garde-fou de la
      // grille le refuserait de toute façon).
      if (GridEditor.isActive()) {
        const slot = GridEditor.barSlot();
        if (slot) {
          panel.dock(slot);
          syncGridButtons();
          const attrs = editor.getAttributes('tableCell').backgroundColor ? editor.getAttributes('tableCell') : editor.getAttributes('tableHeader');
          EditorCore.setColorBar('v2-table-fill-bar', attrs.backgroundColor || null);
          return;
        }
      }
      if (panel.isDocked()) panel.undock();
      // editor.isActive(...) ne change pas seul quand le focus quitte l'éditeur - vérifier hasFocus() explicitement pour fermer le panneau au clic hors de
      // l'éditeur.
      if (!editor.view.hasFocus()) { panel.hide(); return; }
      if (!editor.isActive('table')) { panel.hide(); return; }
      const { $from } = editor.state.selection;
      let tableDepth = -1;
      for (let d = $from.depth; d > 0; d--) { if ($from.node(d).type.name === 'table') { tableDepth = d; break; } }
      if (tableDepth === -1) { panel.hide(); return; }
      // nodeDOM d'une table renvoie le wrapper (.tableWrapper de prosemirror-tables), pas le <table> - redescend dessus pour l'ancrage.
      const dom = editor.view.nodeDOM($from.before(tableDepth));
      if (!dom) { panel.hide(); return; }
      const tableEl = dom.tagName === 'TABLE' ? dom : (dom.querySelector && dom.querySelector('table')) || dom;
      panel.show(tableEl);
      const tableDelBtn = panel.el.querySelector('button[data-action="table-del"]');
      if (tableDelBtn) tableDelBtn.classList.remove('v2-hf-locked');
      // aria-disabled plutôt que disabled : un <button disabled> ne reçoit plus le survol, son info-bulle expliquant POURQUOI il est grisé ne s'afficherait pas.
      const colDelBtn = panel.el.querySelector('button[data-action="col-del"]');
      if (colDelBtn) {
        const blocked = columnDeleteBlocked();
        colDelBtn.classList.toggle('is-disabled', blocked);
        colDelBtn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
        colDelBtn.title = I18n.t(blocked ? 'table.colDelMerged' : 'table.colDel');
      }
      const rowDelBtn = panel.el.querySelector('button[data-action="row-del"]');
      if (rowDelBtn) {
        const blocked = rowDeleteBlocked();
        rowDelBtn.classList.toggle('is-disabled', blocked);
        rowDelBtn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
        rowDelBtn.title = I18n.t(blocked ? 'table.rowDelMerged' : 'table.rowDel');
      }
      const cellAttrs = editor.getAttributes('tableCell').backgroundColor ? editor.getAttributes('tableCell') : editor.getAttributes('tableHeader');
      EditorCore.setColorBar('v2-table-fill-bar', cellAttrs.backgroundColor || null);
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
      `<button data-action="delete" title="${I18n.t('imgToolbar.delete')}">${Icons.svg('trash')}</button>`,
    ].join('');

    // Exige une VRAIE NodeSelection (`.node`), pas juste editor.isActive() qui reste vrai pour une simple sélection de texte traversant l'image. Duck-typing
    // sur `.node` plutôt que `instanceof NodeSelectionClass` : un clic réel échoue cet instanceof (deux exemplaires distincts du module prosemirror-state).
    function selectedImageNode() {
      const node = editor.state.selection.node;
      return (node && node.type && node.type.name === 'editorImage') ? node : null;
    }

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
      // En pixels de mise en page, comme la largeur du conteneur juste dessous : getBoundingClientRect est en pixels écran, plus petits que ceux de la page quand la
      // feuille est réduite (~0,85 à 700 px). Sans la division, « à droite » dépassait de la marge et « au centre » tombait à côté.
      const imgWidthPx = img.getBoundingClientRect().width / EditorCore.layoutZoom(img);
      const containerWidthPx = EditorCore.editorContentWidthPx(editor);
      // `left` est stocké depuis le bord de la boîte de padding, mais l'alignement vise le bord du texte - décalage explicite du padding.
      const rootCs = getComputedStyle(editor.view.dom);
      const padLeft = parseFloat(rootCs.paddingLeft) || 0;
      const left = align === 'left' ? padLeft : align === 'center' ? padLeft + Math.max(0, (containerWidthPx - imgWidthPx) / 2) : padLeft + Math.max(0, containerWidthPx - imgWidthPx);
      updateSelectedImage({ left: Math.round(left) });
      // dispatch() ci-dessus a déjà mis à jour le DOM de façon synchrone (NodeView applyAttrs) : `dom` reflète donc déjà la nouvelle position, mesurable
      // immédiatement pour la grille page (voir setLayer, même schéma).
      const grid = HeaderFooterPreview.computePageGridPosition(dom);
      // offsetLeft/offsetTop APRÈS computePageGridPosition (pas `left` recalculé ci-dessus) : reflète une éventuelle correction si l'alignement sortait de
      // la page physique (cf. le commentaire de computePageGridPosition) - improbable pour un alignement horizontal classique, mais garde tout cohérent
      // (et rattrape au passage un `top` déjà hors bornes avant cet appel, sans quoi il resterait stocké tel quel malgré la correction visuelle).
      if (grid) updateSelectedImage(Object.assign({ left: Math.round(dom.offsetLeft), top: Math.round(dom.offsetTop) }, grid));
    }

    // Sélecteur explicite à 3 états (normal/devant/derrière), chaque bouton fixe le calque visé. Au premier passage en calque, initialise left/top depuis la
    // position RENDUE actuelle pour éviter un saut visuel.
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
          // Écart mesuré en pixels écran, `left`/`top` s'écrivent en pixels de mise en page : à ~700 px de panneau (feuille réduite à ~0,85) l'image sautait en haut à
          // gauche au premier passage en calque.
          const zoom = EditorCore.layoutZoom(img);
          patch.left = Math.round((imgRect.left - rootRect.left) / zoom);
          patch.top = Math.round((imgRect.top - rootRect.top) / zoom);
          // Reporté IMMÉDIATEMENT sur `dom` (pas seulement sur `patch`, qui n'est appliqué qu'à la toute fin) : computePageGridPosition ci-dessous mesure
          // ET corrige `dom` lui-même si cette position sort de la page physique (cf. son propre commentaire) - sans ce report, la correction ne serait
          // jamais reflétée dans le left/top finalement enregistré.
          dom.style.position = 'absolute';
          dom.style.left = patch.left + 'px';
          dom.style.top = patch.top + 'px';
        }
        // Grille page (pageIndex/pageLeftPt/pageTopPt) : capturée à CHAQUE passage en calque (pas seulement au 1er), lue directement sur le rendu réel
        // (Aperçu A4) - c'est cette valeur, pas left/top, que pdf-export.js utilise désormais pour garantir un rendu identique éditeur/PDF.
        if (dom) {
          const grid = HeaderFooterPreview.computePageGridPosition(dom);
          if (grid) {
            Object.assign(patch, grid);
            // offsetLeft/offsetTop APRÈS computePageGridPosition : reflète une éventuelle correction du 1er calque ci-dessus. Seulement pertinent quand ce
            // bloc vient de positionner `dom` lui-même (patch.left/top déjà posés) - pour un changement de calque ULTÉRIEUR (left/top déjà existants),
            // `dom` n'est pas nécessairement en position:absolute au bon endroit à cet instant, patch.left/top restent alors ceux déjà stockés dans
            // node.attrs (comportement inchangé).
            if (patch.left != null && patch.top != null) {
              patch.left = Math.round(dom.offsetLeft);
              patch.top = Math.round(dom.offsetTop);
            }
          }
        }
      }
      EditorCore.patchNodeAndReselect(editor, pos, Object.assign({}, node.attrs, patch));
    }

    // Flèches du clavier sur une image en calque (devant ou derrière le texte) SÉLECTIONNÉE : 1 px de mise en page par appui, 10 px avec Maj, répété quand la touche reste appuyée.
    // Même chemin que le glisser de la NodeView (onMoveUp, js/editor-nodes.js) : `left`/`top` s'écrivent, puis la grille page est relue sur le rendu pour que le PDF et le Word suivent.
    // Suivi des modifications actif, le déplacement laisse sa trace comme le glisser (EditorNodes.moveImageNode) : le premier appui d'une rafale laisse l'original barré et pose la copie
    // à sa nouvelle place, resélectionnée ; les appuis suivants déplacent cette copie, sans empiler d'autres traces.
    // Une image dans le texte et toute autre sélection gardent les flèches de ProseMirror. Une image que le curseur vient de sélectionner EN ARRIVANT dessus (ProseMirror sélectionne un
    // atome au lieu de le traverser) n'est pas visée non plus : la flèche suivante la traverse comme avant ; sinon, depuis l'ancre d'une image en calque (souvent le premier paragraphe),
    // on ne pourrait plus avancer dans le texte au clavier, et la touche tenue appuyée ferait glisser l'image sur la page. Un clic, une action de cette barre ou un glissé sont un choix :
    // ils rendent les flèches à l'image.
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
      // Posée d'abord sur le DOM : la grille page se mesure sur le rendu, comme au glisser. computePageGridPosition repousse l'image au bord de la page physique si elle en sortait :
      // `left`/`top` se relisent donc APRÈS, sur le style qu'elle corrige (offsetLeft compterait aussi la marge d'une image habillée à gauche ou à droite).
      dom.style.left = (left0 + dx) + 'px';
      dom.style.top = (top0 + dy) + 'px';
      const grid = HeaderFooterPreview.computePageGridPosition(dom);
      const patch = { left: Math.round(parseFloat(dom.style.left) || 0), top: Math.round(parseFloat(dom.style.top) || 0) };
      if (grid) Object.assign(patch, grid);
      if (!EditorNodes.moveImageNode(editor, target.pos, patch)) {
        // Contre le bord de la page : la flèche est consommée mais rien ne s'écrit (ni modification du document, ni étape d'historique de plus, ni trace en suivi).
        dom.style.left = left0 + 'px';
        dom.style.top = top0 + 'px';
      }
    }

    // Phase de capture : avant ProseMirror et ses raccourcis (curseur de passerelle, tableaux), qui prennent aussi les flèches ; un événement dont preventDefault a été appelé n'est plus traité par
    // ProseMirror.
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
      // Rendue à ProseMirror : si sa flèche pose la sélection sur une image en calque, la transaction part pendant cet événement (cf. l'écoute de 'transaction' plus bas).
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

    // « Sur toutes les pages » (js/page-layer.js) : la case de l'image « derrière le texte ». Il lui faut la place de la page (grille page), connue dès que l'image a été positionnée
    // dans l'Aperçu A4 ; une image plus ancienne la reçoit ici, mesurée sur le rendu comme au passage en calque.
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

    const panel = EditorCore.createFloatingPanel('v2-floating-toolbar', html, (action) => {
      const selNode = selectedImageNode();
      if (!selNode) return;
      const attrs = selNode.attrs;
      // Plafond en mode en-tête/pied (cf. clampWidthForHfMaxSize, en tête de fichier) : zoom avant/reset restent utilisables (poignées aussi, cf.
      // startResize) - juste bornés à la taille max, jamais bloqués. zoom-out n'a besoin d'aucun plafond (il ne fait que rétrécir).
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
        wrap: () => updateSelectedImage({ wrap: attrs.wrap === 'block' ? 'inline' : 'block' }),
        'layer-normal': () => setLayer('normal'),
        // Verrouillé en mode en-tête/pied (cf. syncState pour le grisage visuel) - garde-fou en plus du CSS pointer-events:none : pdf-export.js ne résout
        // pas encore la position d'une image en calque dans un en-tête/pied (pas de mesure en 2 passes pour cette zone, contrairement au flux principal).
        // Grillé aussi dans une grille (js/grid-editor.js) : une image y est posée sur sa case, à sa taille - jamais en calque.
        'layer-front': () => { if (!HeaderFooterPreview.getHfMode() && !GridEditor.isActive()) setLayer('front'); },
        'layer-behind': () => { if (!HeaderFooterPreview.getHfMode() && !GridEditor.isActive()) setLayer('behind'); },
        repeat: toggleRepeat,
        delete: () => {
          const pos = editor.state.selection.from;
          editor.chain().focus().deleteRange({ from: pos, to: pos + selNode.nodeSize }).run();
        },
      };
      (commands[action] || (() => {}))();
    }, (role, value) => {
      if (role === 'opacity') updateSelectedImage({ opacity: Math.max(0.1, parseInt(value, 10) / 100) });
    });

    function syncState() {
      const node = selectedImageNode();
      if (!node) return;
      const attrs = node.attrs;
      const opacityInput = panel.el.querySelector('input[data-role="opacity"]');
      if (opacityInput && document.activeElement !== opacityInput) opacityInput.value = Math.round((attrs.opacity != null ? attrs.opacity : 1) * 100);
      const setActive = (action, isActive) => { const btn = panel.el.querySelector(`button[data-action="${action}"]`); if (btn) btn.classList.toggle('is-active', !!isActive); };
      setActive('align-left', attrs.align === 'left');
      setActive('align-center', attrs.align === 'center');
      setActive('align-right', attrs.align === 'right');
      setActive('wrap', attrs.wrap === 'block');
      setActive('layer-normal', !attrs.layer || attrs.layer === 'normal');
      setActive('layer-front', attrs.layer === 'front');
      setActive('layer-behind', attrs.layer === 'behind');
      // Cf. commentaire sur 'layer-front'/'layer-behind' dans onAction ci-dessus : calque non résolu par pdf-export.js à l'intérieur d'un en-tête/pied, grisé
      // pendant tout le mode (même classe/mécanisme que le reste de la toolbar, cf. .v2-hf-locked dans css/toolbar-v2.css).
      const setLockedBtn = (action, locked) => { const btn = panel.el.querySelector(`button[data-action="${action}"]`); if (btn) btn.classList.toggle('v2-hf-locked', !!locked); };
      setLockedBtn('layer-front', !!HeaderFooterPreview.getHfMode() || GridEditor.isActive());
      setLockedBtn('layer-behind', !!HeaderFooterPreview.getHfMode() || GridEditor.isActive());
      // « Sur toutes les pages » : grisée (jamais retirée) tant que l'image n'est pas derrière le texte ; aria-disabled plutôt que disabled pour que l'info-bulle, qui dit
      // pourquoi, reste affichée au survol.
      const repeatBtn = panel.el.querySelector('button[data-action="repeat"]');
      if (repeatBtn) {
        const reason = repeatUnavailableReason(attrs);
        repeatBtn.classList.toggle('is-active', !reason && !!attrs.repeat);
        repeatBtn.classList.toggle('is-disabled', !!reason);
        repeatBtn.setAttribute('aria-disabled', reason ? 'true' : 'false');
        repeatBtn.setAttribute('aria-pressed', !reason && attrs.repeat ? 'true' : 'false');
        repeatBtn.title = I18n.t(reason || 'imgToolbar.repeat');
      }
    }

    // Sélection visuelle recalculée ici (pas via selectNode/deselectNode, peu fiable après un setNodeMarkup) : source de vérité unique.
    EditorCore.registerFloatingPanel(panel);
    const check = ({ transaction } = {}) => {
      // Le blur de l'éditeur (un clic ailleurs dans la page) est une transaction de plus : la traiter rouvrait la barre juste après le filet de editor-core.js qui venait de la
      // fermer (clic hors de .tiptap et hors de la barre) - elle restait affichée après un vrai clic sur le texte d'état, par exemple. Un blur ne change ni la sélection ni le
      // document, il n'y a rien à recalculer.
      if (transaction && transaction.getMeta('blur')) return;
      // PAS de garde hasFocus() ici (contrairement à wireTableFloatingToolbar) : ce panneau contient un vrai contrôle de formulaire (slider d'opacité,
      // data-role="opacity") - cf. commentaire détaillé équivalent dans wireVariableFloatingToolbar sur pourquoi hasFocus()/document.activeElement sont
      // invérifiables de façon fiable au moment où l'utilisateur interagit avec un contrôle natif. La fermeture "clic hors du panneau" reste déjà gérée
      // ailleurs (hideFloatingContextToolbars, js/editor-core.js) ; ici, seule la sélection réelle (image toujours sélectionnée ou non) décide.
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

  // Barre flottante d'une bulle #Variable (même modèle que l'image), ouverte sur TOUTES les variables depuis la maquette validée le 2026-09-28 : un groupe
  // d'actions à gauche (condition d'affichage, autres attributs de la même ligne, boucle sur les lignes liées), puis, pour une colonne nombre, date ou
  // Oui / Non seulement, le sous-panneau de formatage choisi par le type de colonne Grist (nombre et date inchangés ; Oui / Non : trois cases et « vrai / faux »).
  // Une bulle « Calcul » (js/variable-calc.js) ouvre la même barre : « Modifier le calcul » à la place du groupe d'actions (condition, autres attributs et boucle sont grisés, sans objet
  // pour une formule) et le réglage nombre, son résultat étant un nombre.
  function wireVariableFloatingToolbar() {
    const dateOptions = VariableFormat.DATE_PRESETS.map(p => `<option value="${p.key}">${VariableFormat.presetLabel(p)}</option>`).join('');
    const html = [
      '<div class="v2-varbadge-actions">',
      `<button data-action="calc-edit" title="${I18n.t('varToolbar.calcEdit')}" aria-label="${I18n.t('varToolbar.calcEdit')}" hidden>${Icons.svg('calc')}</button>`,
      `<button data-action="var-condition" title="${I18n.t('varToolbar.condition')}" aria-label="${I18n.t('varToolbar.condition')}">${Icons.svg('varCondition')}</button>`,
      `<button data-action="var-linked" title="${I18n.t('varToolbar.linked')}" aria-label="${I18n.t('varToolbar.linked')}">${Icons.svg('varLinked')}</button>`,
      `<button data-action="var-loop" title="${I18n.t('varToolbar.loop')}" aria-label="${I18n.t('varToolbar.loop')}">${Icons.svg('varLoop')}</button>`,
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
      // Colonne Oui / Non : les trois cases de la liste à cases (mêmes icônes, mêmes noms) puis le texte « vrai / faux ». Libellés et infobulles réécrits par syncState (langue en cours).
      '<div data-var-panel="bool" hidden>',
      '<span class="v2-varfmt-seg">',
      VariableFormat.BOOL_CHECKBOX_STYLES.map(style => `<button data-action="bool-style:${style}">${Icons.svg('checklist' + style.charAt(0).toUpperCase() + style.slice(1))}</button>`).join(''),
      '<button data-action="bool-style:text"></button>',
      '</span>',
      '</div>',
    ].join('');
    const panel = EditorCore.createFloatingPanel('v2-floating-toolbar v2-varfmt-toolbar', html, onAction, onInput);
    EditorCore.registerFloatingPanel(panel);

    function selectedVarBadgeNode() {
      const node = editor.state.selection.node;
      return (node && node.type && node.type.name === 'varBadge') ? node : null;
    }
    function selectedCalcBadgeNode() {
      const node = editor.state.selection.node;
      return (node && node.type && node.type.name === 'calcBadge') ? node : null;
    }
    // La bulle dont la barre règle le format : une variable ou un calcul. Le type de colonne d'un calcul est « Numérique » (son résultat est un nombre, écrit et caché à zéro comme celui
    // d'une colonne Numérique, cf. Variables.resolveCalcResult).
    function selectedFormatNode() { return selectedVarBadgeNode() || selectedCalcBadgeNode(); }
    function columnTypeOf(node) { return node.type.name === 'calcBadge' ? 'Numeric' : GristAPI.getColumnType(node.attrs.table, node.attrs.column); }
    // Un bloc de texte conditionnel sélectionné (clic sur son étiquette, js/editor-nodes.js:createConditionalTextNode) ouvre la même barre : sa condition d'affichage
    // seulement (la même fenêtre que celle d'une bulle) ; « Autres attributs » et « Boucle » n'ont pas d'objet ici et sont grisés, avec leur raison en info-bulle.
    function selectedBlockNode() {
      const node = editor.state.selection.node;
      return (node && node.type && node.type.name === 'conditionalText') ? node : null;
    }
    // Une case conditionnelle sélectionnée (clic sur la puce, js/editor-nodes.js:createConditionalCheckboxNode) ouvre la même barre : sa condition (la même fenêtre que celle d'une bulle)
    // et les trois styles de case ; « Autres attributs » et « Boucle » n'ont pas d'objet ici et sont grisés, avec leur raison en info-bulle.
    function selectedCheckboxNode() {
      const node = editor.state.selection.node;
      return (node && node.type && node.type.name === 'conditionalCheckbox') ? node : null;
    }
    function setSelectedBadgeFormat(format) {
      const node = selectedFormatNode();
      if (!node) return;
      EditorCore.patchNodeAndReselect(editor, editor.state.selection.from, Object.assign({}, node.attrs, { format }));
    }
    function updateSelectedBadge(patch) {
      const node = selectedFormatNode();
      if (!node) return;
      setSelectedBadgeFormat(Object.assign({}, node.attrs.format, patch));
    }
    // « Autres attributs » n'a de sens que si la variable désigne une ligne d'une AUTRE table : variable d'une autre table (déjà liée à l'insertion), ou
    // colonne Référence de la table de la page (la ligne référencée). Grisé sinon (pas retiré) ; une RefList désigne plusieurs lignes (future boucle).
    // Règle tenue par la fenêtre elle-même (js/variable-linked-attrs.js:targetFor).
    function linkedAttrsAvailable(node) {
      return VariableLinkedAttrs.isAvailable(node.attrs);
    }
    function onAction(action) {
      if (selectedBlockNode()) {
        if (action === 'var-condition') VariableCondition.open(editor, editor.state.selection.from);
        return;
      }
      const checkbox = selectedCheckboxNode();
      if (checkbox) {
        if (action === 'var-condition') VariableCondition.open(editor, editor.state.selection.from);
        else if (action.indexOf('bool-style:') === 0 && VariableFormat.isCheckboxStyle(action.slice(11))) {
          EditorCore.patchNodeAndReselect(editor, editor.state.selection.from, Object.assign({}, checkbox.attrs, { style: action.slice(11) }));
        }
        return;
      }
      const node = selectedFormatNode();
      if (!node) return;
      const isCalc = node.type.name === 'calcBadge';
      // Position capturée AU CLIC : la fenêtre ouverte ensuite retire le focus de l'éditeur, et c'est cette bulle précise qu'elle modifiera.
      if (action === 'calc-edit') { if (isCalc) VariableCalc.openAt(editor, editor.state.selection.from); return; }
      // Condition, autres attributs et boucle n'ont pas d'objet pour un calcul : leurs boutons sont grisés (syncState), un clic dessus ne fait rien.
      if (isCalc && (action === 'var-condition' || action === 'var-linked' || action === 'var-loop')) return;
      if (action === 'var-condition') { VariableCondition.open(editor, editor.state.selection.from); return; }
      if (action === 'var-linked') {
        if (!linkedAttrsAvailable(node)) return;
        VariableLinkedAttrs.open(editor, editor.state.selection.from);
        return;
      }
      if (action === 'var-loop') {
        if (!VariableLoop.status(editor, editor.state.selection.from, node).enabled) return;
        VariableLoop.open(editor, editor.state.selection.from);
        return;
      }
      if (action.indexOf('num-style:') === 0) { updateSelectedBadge({ type: 'number', style: action.slice(10) }); return; }
      // Bascule du zéro : enfoncé (0 barré), le zéro ne s'écrit pas - c'est l'écriture par défaut -, relâché la bulle l'affiche (`zero: 'show'`). SANS `type: 'number'`, pour ne pas
      // poser de style à la place de celui que la barre annonce déjà (FR, ou US en interface anglaise) ; revenir à l'écriture par défaut retire la clé, et une bulle sans autre
      // réglage retrouve un format vide.
      if (action === 'num-zero') {
        const hidden = Variables.zeroHidden(node.attrs.format, columnTypeOf(node));
        const next = Object.assign({}, node.attrs.format);
        if (hidden) next.zero = 'show'; else delete next.zero;
        setSelectedBadgeFormat(Object.keys(next).length ? next : null);
        return;
      }
      if (action === 'num-words') {
        const current = node.attrs.format || {};
        updateSelectedBadge({ type: 'number', words: !current.words });
        return;
      }
      // Le dernier composant J/M/A actif ne peut pas être désactivé (date vide sinon).
      if (action.indexOf('date-part:') === 0) {
        const part = action.slice(10);
        const current = node.attrs.format || {};
        const activeParts = ['day', 'month', 'year'].filter(p => current[p] !== false);
        if (activeParts.length === 1 && activeParts[0] === part) return;
        updateSelectedBadge({ type: 'date', [part]: current[part] === false });
        return;
      }
      if (action === 'date-words') {
        const current = node.attrs.format || {};
        updateSelectedBadge({ type: 'date', words: !current.words });
        return;
      }
      // Oui / Non : le style remplace tout le format (une colonne passée de nombre à Oui / Non ne garde pas ses décimales). « vrai / faux » est l'écriture par défaut : la choisir retire le réglage,
      // la bulle retrouve un format vide (sans le point bleu d'une bulle réglée), comme le bouton du zéro d'un nombre.
      if (action.indexOf('bool-style:') === 0) {
        const style = action.slice(11);
        if (style === 'text') setSelectedBadgeFormat(null);
        else if (VariableFormat.isCheckboxStyle(style)) setSelectedBadgeFormat({ type: 'bool', style });
      }
    }
    function onInput(role, value) {
      const node = selectedFormatNode();
      if (!node) return;
      if (role === 'num-decimals') { updateSelectedBadge({ type: 'number', decimals: value === '' ? null : parseInt(value, 10) }); return; }
      if (role === 'num-currency') { updateSelectedBadge({ type: 'number', currency: value.trim() }); return; }
      if (role === 'date-preset') { updateSelectedBadge({ type: 'date', preset: value }); return; }
    }

    // aria-disabled plutôt que disabled : un <button disabled> ne reçoit plus le survol, son info-bulle expliquant POURQUOI il est grisé ne s'afficherait pas.
    function setButtonDisabled(button, disabled, title) {
      if (!button) return;
      button.classList.toggle('is-disabled', disabled);
      button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      button.title = title;
    }
    // Le bouton de condition garde son nom d'origine pour une bulle et un bloc ; une case conditionnelle dit « cochée si… » (une condition d'affichage n'aurait pas de sens pour elle).
    function setConditionTitle(key) {
      const conditionBtn = panel.el.querySelector('button[data-action="var-condition"]');
      if (!conditionBtn) return;
      conditionBtn.title = I18n.t(key);
      conditionBtn.setAttribute('aria-label', conditionBtn.title);
    }
    function syncBlockState(node) {
      setConditionTitle('varToolbar.condition');
      const calcBtn = panel.el.querySelector('button[data-action="calc-edit"]');
      if (calcBtn) calcBtn.hidden = true;
      const conditionBtn = panel.el.querySelector('button[data-action="var-condition"]');
      setButtonDisabled(conditionBtn, false, I18n.t('varToolbar.condition'));
      if (conditionBtn) conditionBtn.classList.toggle('is-active', !!ConditionRules.normalizeCondition(node.attrs.condition));
      const linkedBtn = panel.el.querySelector('button[data-action="var-linked"]');
      setButtonDisabled(linkedBtn, true, I18n.t('varToolbar.linkedBlock'));
      if (linkedBtn) linkedBtn.classList.remove('is-active');
      const loopBtn = panel.el.querySelector('button[data-action="var-loop"]');
      setButtonDisabled(loopBtn, true, I18n.t('varToolbar.loopBlock'));
      if (loopBtn) loopBtn.classList.remove('is-active');
    }

    // Les boutons des styles de case : celui du style en cours est allumé et enfoncé. « vrai / faux » (`text`) est le style d'une bulle sans réglage ; une case conditionnelle n'a pas ce bouton.
    // Libellés et infobulles relus à chaque ouverture : la langue de l'interface a pu changer depuis la création de la barre.
    function syncBoolButtons(currentStyle) {
      const boolTitles = { accentStrike: 'varFmt.boolAccentStrike', classic: 'list.checklistClassic.tip', accentPlain: 'list.checklistAccentPlain.tip', text: 'varFmt.boolTextTitle' };
      Object.keys(boolTitles).forEach(style => {
        const btn = panel.el.querySelector(`button[data-action="bool-style:${style}"]`);
        if (!btn) return;
        btn.classList.toggle('is-active', style === currentStyle);
        btn.title = I18n.t(boolTitles[style]);
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-pressed', style === currentStyle ? 'true' : 'false');
        if (style === 'text') btn.textContent = I18n.t('varFmt.boolTextButton');
      });
    }
    function syncCheckboxState(node) {
      setConditionTitle('varToolbar.conditionCheckbox');
      // Un calcul choisi juste avant a montré « Modifier le calcul » et grisé la condition : l'un repart, l'autre revient (comme pour un bloc, syncBlockState).
      const calcBtn = panel.el.querySelector('button[data-action="calc-edit"]');
      if (calcBtn) calcBtn.hidden = true;
      const conditionBtn = panel.el.querySelector('button[data-action="var-condition"]');
      setButtonDisabled(conditionBtn, false, I18n.t('varToolbar.conditionCheckbox'));
      if (conditionBtn) conditionBtn.classList.toggle('is-active', !!ConditionRules.normalizeCondition(node.attrs.condition));
      const linkedBtn = panel.el.querySelector('button[data-action="var-linked"]');
      setButtonDisabled(linkedBtn, true, I18n.t('varToolbar.linkedCheckbox'));
      if (linkedBtn) linkedBtn.classList.remove('is-active');
      const loopBtn = panel.el.querySelector('button[data-action="var-loop"]');
      setButtonDisabled(loopBtn, true, I18n.t('varToolbar.loopCheckbox'));
      if (loopBtn) loopBtn.classList.remove('is-active');
      syncBoolButtons(ConditionalCheckbox.styleOf(node.attrs.style));
    }

    function syncState() {
      const node = selectedFormatNode();
      if (!node) return;
      setConditionTitle('varToolbar.condition');
      const isCalc = node.type.name === 'calcBadge';
      const format = node.attrs.format || {};
      const setActive = (action, isActive) => { const btn = panel.el.querySelector(`button[data-action="${action}"]`); if (btn) btn.classList.toggle('is-active', !!isActive); };
      const calcBtn = panel.el.querySelector('button[data-action="calc-edit"]');
      if (calcBtn) calcBtn.hidden = !isCalc;
      const conditionBtn = panel.el.querySelector('button[data-action="var-condition"]');
      setButtonDisabled(conditionBtn, isCalc, I18n.t(isCalc ? 'varToolbar.notForCalc' : 'varToolbar.condition'));
      setActive('var-condition', !isCalc && !!ConditionRules.normalizeCondition(node.attrs.condition));
      if (isCalc) {
        // Un calcul n'a ni autre attribut de sa ligne ni boucle : les deux boutons restent à leur place, grisés, avec leur raison en info-bulle.
        setButtonDisabled(panel.el.querySelector('button[data-action="var-linked"]'), true, I18n.t('varToolbar.notForCalc'));
        setButtonDisabled(panel.el.querySelector('button[data-action="var-loop"]'), true, I18n.t('varToolbar.notForCalc'));
        setActive('var-linked', false);
        setActive('var-loop', false);
      }
      // aria-disabled plutôt que disabled : un <button disabled> ne reçoit plus le survol, son info-bulle expliquant POURQUOI il est grisé ne s'afficherait pas.
      const linkedBtn = isCalc ? null : panel.el.querySelector('button[data-action="var-linked"]');
      if (linkedBtn) {
        const available = linkedAttrsAvailable(node);
        linkedBtn.classList.toggle('is-disabled', !available);
        linkedBtn.setAttribute('aria-disabled', available ? 'false' : 'true');
        linkedBtn.title = I18n.t(available ? 'varToolbar.linked' : 'varToolbar.linkedDisabled');
      }
      // Boucle : active (bleue) quand posée ; grisée pour une variable qui ne montre qu'une ligne, ou déjà répétée avec une autre bulle (js/variable-loop.js).
      const loopBtn = isCalc ? null : panel.el.querySelector('button[data-action="var-loop"]');
      if (loopBtn) {
        const loop = VariableLoop.status(editor, editor.state.selection.from, node);
        loopBtn.classList.toggle('is-active', loop.active);
        loopBtn.classList.toggle('is-disabled', !loop.enabled);
        loopBtn.setAttribute('aria-disabled', loop.enabled ? 'false' : 'true');
        loopBtn.title = loop.title;
      }
      // Repli aligné sur la langue de l'interface, sauf si un style explicite est déjà posé.
      const defaultStyle = I18n.getLang() === 'en' ? 'us' : 'fr';
      const style = format.type === 'number' ? (format.style || defaultStyle) : defaultStyle;
      setActive('num-style:fr', style === 'fr');
      setActive('num-style:us', style === 'us');
      setActive('num-style:none', style === 'none');
      setActive('num-words', format.type === 'number' && !!format.words);
      panel.el.querySelector('[data-var-panel="number"]').classList.toggle('v2-varfmt-words-active', format.type === 'number' && !!format.words);
      const decimalsSelect = panel.el.querySelector('select[data-role="num-decimals"]');
      if (decimalsSelect && document.activeElement !== decimalsSelect) decimalsSelect.value = (format.type === 'number' && format.decimals != null) ? String(format.decimals) : '';
      const currencyInput = panel.el.querySelector('input[data-role="num-currency"]');
      if (currencyInput && document.activeElement !== currencyInput) currencyInput.value = (format.type === 'number' && format.currency) ? format.currency : '';
      // Même règle que le rendu (Variables.zeroHidden) : la barre montre ce que le document écrit - bouton enfoncé et 0 barré tant que le zéro ne s'écrit pas. Le trait
      // du 0 se cache par son attribut `display` : remplacer le SVG pendant le mousedown détacherait la cible du clic, que le filet de editor-core.js (clic hors de la barre
      // = on ferme) prendrait alors pour un clic ailleurs.
      const zeroBtn = panel.el.querySelector('button[data-action="num-zero"]');
      if (zeroBtn) {
        const zeroOff = Variables.zeroHidden(format, columnTypeOf(node));
        setActive('num-zero', zeroOff);
        zeroBtn.setAttribute('aria-pressed', zeroOff ? 'true' : 'false');
        const slash = zeroBtn.querySelector('svg path');
        if (slash) slash.setAttribute('display', zeroOff ? 'inline' : 'none');
      }
      const dateSelect = panel.el.querySelector('select[data-role="date-preset"]');
      if (dateSelect && document.activeElement !== dateSelect) dateSelect.value = (format.type === 'date' && format.preset) ? format.preset : VariableFormat.DATE_PRESETS[0].key;
      const isDate = format.type === 'date';
      setActive('date-part:day', !isDate || format.day !== false);
      setActive('date-part:month', !isDate || format.month !== false);
      setActive('date-part:year', !isDate || format.year !== false);
      setActive('date-words', isDate && !!format.words);
      // Oui / Non : le style en cours est allumé, « vrai / faux » tant que rien n'est réglé (c'est ce que la bulle écrit).
      syncBoolButtons(VariableFormat.boolStyle(format));
    }

    const check = ({ transaction } = {}) => {
      // Le blur de l'éditeur ne passe pas ici : cf. wireImageFloatingToolbar (il rouvrait la barre que le clic hors de l'éditeur venait de fermer).
      if (transaction && transaction.getMeta('blur')) return;
      // PAS de garde hasFocus()/document.activeElement ici, contrairement à un premier correctif tenté puis insuffisant : ce panneau contient de vrais
      // contrôles de formulaire (select nb décimales/format de date, input devise) - cliquer dessus déplace bien le focus DOM hors de l'éditeur (mesuré :
      // editor.view.hasFocus() devient faux), MAIS le <select> lui-même ne reçoit pas forcément le focus DOM de façon fiable/synchrone pour autant (mesuré
      // via instrumentation focusin/focusout : le blur de l'éditeur est immédiat, le focusin sur le <select> n'arrive parfois jamais) - `panel.el.
      // contains(document.activeElement)` était donc un filet insuffisant, le panneau se refermait quand même à l'instant précis où le menu déroulant
      // natif commençait tout juste à s'ouvrir (symptôme rapporté : "la liste apparaît une micro-seconde puis disparaît"). La fermeture "clic hors du
      // panneau" reste déjà gérée ailleurs (hideFloatingContextToolbars, js/editor-core.js, basée sur la CIBLE du mousedown, pas sur le focus résultant -
      // fiable y compris pour un <select>) ; ici, seule la sélection réelle (bulle #Variable toujours sélectionnée ou non) décide de fermer le panneau.
      const block = selectedBlockNode();
      const checkbox = selectedCheckboxNode();
      const node = (block || checkbox) ? null : selectedFormatNode();
      if (!block && !checkbox && !node) { panel.hide(); return; }
      // Fenêtre de condition / d'autres attributs / de boucle / de calcul ouverte sur cette bulle : la barre reste masquée tant qu'elle l'est (règle d'Antoine) ; son niveau, sous les fenêtres, la
      // cacherait de toute façon derrière le voile.
      if (VariableCondition.isOpen() || VariableLinkedAttrs.isOpen() || VariableLoop.isOpen() || VariableCalc.isOpen()) { panel.hide(); return; }
      // Bloc de texte conditionnel : pas de réglage nombre/date ni de séparateur, et la barre s'ancre sur l'étiquette du bloc (en haut à gauche), pas au milieu de sa largeur.
      const type = node ? columnTypeOf(node) : null;
      const isNumber = type === 'Numeric' || type === 'Int';
      const isDate = type === 'Date' || type === 'DateTime';
      // Les trois cases : une colonne Oui / Non, et la case conditionnelle - dont la barre n'a pas « vrai / faux », elle est toujours une case.
      const isBool = type === 'Bool' || !!checkbox;
      panel.el.querySelector('[data-var-panel="number"]').hidden = !isNumber;
      panel.el.querySelector('[data-var-panel="date"]').hidden = !isDate;
      panel.el.querySelector('[data-var-panel="bool"]').hidden = !isBool;
      const textButton = panel.el.querySelector('button[data-action="bool-style:text"]');
      if (textButton) textButton.hidden = !!checkbox;
      panel.el.querySelector('[data-var-sep]').hidden = !isNumber && !isDate && !isBool;
      const dom = editor.view.nodeDOM(editor.state.selection.from);
      // Éditeur masqué (Lecture, résumé d'un macro-modèle) : la bulle reste sélectionnée mais n'a plus de boîte, et floating-ui poserait la barre en haut à gauche (8, 8) -
      // une transaction qui arrive alors (le blur de l'éditeur à un clic sur « Lecture », par exemple) ne doit pas la rouvrir.
      if (!dom || !dom.getClientRects().length) { panel.hide(); return; }
      if (block) {
        syncBlockState(block);
        panel.show((dom.querySelector && dom.querySelector(':scope > .conditional-text-tag')) || dom, GridEditor.floatingOptions);
        return;
      }
      if (checkbox) {
        syncCheckboxState(checkbox);
        panel.show(dom, GridEditor.floatingOptions);
        return;
      }
      syncState();
      panel.show(dom, GridEditor.floatingOptions);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  return { setEditor, wireColorPickers, wireTableFloatingToolbar, wireImageFloatingToolbar, wireVariableFloatingToolbar };
})();
