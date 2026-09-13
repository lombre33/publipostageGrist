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
    const html = buttons.map(([action, icon, title]) =>
      `<button data-action="${action}" title="${title}">${Icons.svg(icon)}</button>`).join('')
      + '<span class="v2-floating-sep"></span>'
      + `<button data-action="fill-open" class="v2-fill-chip" id="v2-table-fill-btn" title="${I18n.t('table.fillOpen')}">`
      + Icons.svg('fill') + '<span class="v2-fill-bar" id="v2-table-fill-bar"></span>' + Icons.svg('caretDown')
      + '</button>';
    const panel = EditorCore.createFloatingPanel('v2-floating-toolbar', html, (action) => {
      const commands = {
        'row-before': () => editor.chain().focus().addRowBefore().run(),
        'row-after': () => editor.chain().focus().addRowAfter().run(),
        'row-del': () => editor.chain().focus().deleteRow().run(),
        'col-before': () => editor.chain().focus().addColumnBefore().run(),
        'col-after': () => editor.chain().focus().addColumnAfter().run(),
        'col-del': () => editor.chain().focus().deleteColumn().run(),
        'table-del': () => editor.chain().focus().deleteTable().run(),
        'fill-open': () => {
          const btn = document.getElementById('v2-table-fill-btn');
          if (EditorCore.getOpenDropdownPanel() === fillPanel) { EditorCore.closeDropdownPanel(); return; }
          EditorCore.closeDropdownPanel();
          fillPanel.show(btn);
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
    EditorCore.registerFloatingPanel(panel);
    const check = () => {
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
      const imgWidthPx = img.getBoundingClientRect().width;
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
      if (target !== 'normal') {
        const dom = editor.view.nodeDOM(pos);
        const img = dom && dom.querySelector && dom.querySelector('img');
        if (img && (node.attrs.left == null || node.attrs.top == null)) {
          const imgRect = img.getBoundingClientRect();
          // offsetParent du wrapper (pas toujours .tiptap - une cellule de tableau en est un elle-même) : sinon l'image saute à l'affichage.
          const rootRect = (dom.offsetParent || editor.view.dom).getBoundingClientRect();
          patch.left = Math.round(imgRect.left - rootRect.left);
          patch.top = Math.round(imgRect.top - rootRect.top);
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
        'layer-front': () => { if (!HeaderFooterPreview.getHfMode()) setLayer('front'); },
        'layer-behind': () => { if (!HeaderFooterPreview.getHfMode()) setLayer('behind'); },
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
      setLockedBtn('layer-front', !!HeaderFooterPreview.getHfMode());
      setLockedBtn('layer-behind', !!HeaderFooterPreview.getHfMode());
    }

    // Sélection visuelle recalculée ici (pas via selectNode/deselectNode, peu fiable après un setNodeMarkup) : source de vérité unique.
    EditorCore.registerFloatingPanel(panel);
    const check = () => {
      // Un blur réel ne change pas seul la sélection ProseMirror - sans cette garde, une 'transaction' suivante rouvrirait le panneau.
      if (!editor.view.hasFocus()) { panel.hide(); return; }
      document.querySelectorAll('.tiptap .editor-image-view.editor-image-selected').forEach(el => el.classList.remove('editor-image-selected'));
      if (!selectedImageNode()) { panel.hide(); return; }
      const dom = editor.view.nodeDOM(editor.state.selection.from);
      const img = dom && dom.querySelector && dom.querySelector('img');
      if (!img) { panel.hide(); return; }
      dom.classList.add('editor-image-selected');
      syncState();
      panel.show(img);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  // Barre flottante de formatage nombre/date d'une bulle #Variable (même modèle que l'image). Le type de colonne Grist choisit le sous-panneau affiché ; une
  // colonne Texte/Référence n'a rien à formater, barre cachée.
  function wireVariableFloatingToolbar() {
    const dateOptions = VariableFormat.DATE_PRESETS.map(p => `<option value="${p.key}">${VariableFormat.presetLabel(p)}</option>`).join('');
    const html = [
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
    ].join('');
    const panel = EditorCore.createFloatingPanel('v2-floating-toolbar v2-varfmt-toolbar', html, onAction, onInput);
    EditorCore.registerFloatingPanel(panel);

    function selectedVarBadgeNode() {
      const node = editor.state.selection.node;
      return (node && node.type && node.type.name === 'varBadge') ? node : null;
    }
    function updateSelectedBadge(patch) {
      const node = selectedVarBadgeNode();
      if (!node) return;
      const format = Object.assign({}, node.attrs.format, patch);
      EditorCore.patchNodeAndReselect(editor, editor.state.selection.from, Object.assign({}, node.attrs, { format }));
    }
    function onAction(action) {
      const node = selectedVarBadgeNode();
      if (!node) return;
      if (action.indexOf('num-style:') === 0) { updateSelectedBadge({ type: 'number', style: action.slice(10) }); return; }
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
      }
    }
    function onInput(role, value) {
      const node = selectedVarBadgeNode();
      if (!node) return;
      if (role === 'num-decimals') { updateSelectedBadge({ type: 'number', decimals: value === '' ? null : parseInt(value, 10) }); return; }
      if (role === 'num-currency') { updateSelectedBadge({ type: 'number', currency: value.trim() }); return; }
      if (role === 'date-preset') { updateSelectedBadge({ type: 'date', preset: value }); return; }
    }

    function syncState() {
      const node = selectedVarBadgeNode();
      if (!node) return;
      const format = node.attrs.format || {};
      const setActive = (action, isActive) => { const btn = panel.el.querySelector(`button[data-action="${action}"]`); if (btn) btn.classList.toggle('is-active', !!isActive); };
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
      const dateSelect = panel.el.querySelector('select[data-role="date-preset"]');
      if (dateSelect && document.activeElement !== dateSelect) dateSelect.value = (format.type === 'date' && format.preset) ? format.preset : VariableFormat.DATE_PRESETS[0].key;
      const isDate = format.type === 'date';
      setActive('date-part:day', !isDate || format.day !== false);
      setActive('date-part:month', !isDate || format.month !== false);
      setActive('date-part:year', !isDate || format.year !== false);
      setActive('date-words', isDate && !!format.words);
    }

    const check = () => {
      // Cf. commentaire équivalent dans wireTableFloatingToolbar.
      if (!editor.view.hasFocus()) { panel.hide(); return; }
      const node = selectedVarBadgeNode();
      if (!node) { panel.hide(); return; }
      const type = GristAPI.getColumnType(node.attrs.table, node.attrs.column);
      const isNumber = type === 'Numeric' || type === 'Int';
      const isDate = type === 'Date' || type === 'DateTime';
      if (!isNumber && !isDate) { panel.hide(); return; }
      panel.el.querySelector('[data-var-panel="number"]').hidden = !isNumber;
      panel.el.querySelector('[data-var-panel="date"]').hidden = !isDate;
      const dom = editor.view.nodeDOM(editor.state.selection.from);
      if (!dom) { panel.hide(); return; }
      syncState();
      panel.show(dom);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  return { setEditor, wireColorPickers, wireTableFloatingToolbar, wireImageFloatingToolbar, wireVariableFloatingToolbar };
})();
