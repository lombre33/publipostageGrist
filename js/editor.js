// Éditeur — TipTap/ProseMirror. Script classique (pas type="module") : TipTap/ProseMirror chargés via import() dynamique dans init(), pour garder le partage
// de portée globale avec GristAPI/Templates/ReaderMode ; nœuds/extensions construits par des createXxx(...) (classes TipTap indisponibles avant cet import).
const Editor = (function () {
  let editor = null;

  function probeImageDimensions(url) {
    return new Promise((resolve, reject) => {
      const probe = new Image();
      probe.onload = () => resolve({ naturalWidth: probe.naturalWidth, naturalHeight: probe.naturalHeight });
      probe.onerror = reject;
      probe.src = url;
    });
  }
  // Partagée par le bouton toolbar et le collage presse-papiers (src = URL ou data URI).
  async function insertImageAtDefaultSize(src) {
    let width = 320;
    if (HeaderFooterPreview.getHfMode()) {
      try {
        const dims = await probeImageDimensions(src);
        width = HeaderFooterPreview.clampWidthForHfMaxSize(width, dims.naturalWidth, dims.naturalHeight);
      } catch (e) { /* repli sur 320px */ }
    }
    editor.chain().focus().insertImage({ src, alt: 'Image', width: Math.round(width) + 'px' }).run();
  }

  // Popup d'édition d'une note de bas de page. Une seule active à la fois : ouvrir une note en valide une autre déjà ouverte (commitFootnotePopup). Se ferme
  // UNIQUEMENT via une action explicite (OK/Supprimer/Échap/autre note) - jamais au clic extérieur, source de 3 régressions successives.
  let footnotePopupBox = null;
  let footnotePopupPos = null;
  function ensureFootnotePopupBox() {
    if (footnotePopupBox) return footnotePopupBox;
    footnotePopupBox = document.createElement('div');
    footnotePopupBox.id = 'v2-footnote-popup';
    footnotePopupBox.style.display = 'none';
    const textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.placeholder = I18n.t('footnotePopup.placeholder');
    textarea.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); commitFootnotePopup(); }
    });
    footnotePopupBox.appendChild(textarea);
    const actions = document.createElement('div');
    actions.className = 'v2-footnote-popup-actions';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'v2-footnote-popup-delete';
    delBtn.textContent = I18n.t('footnotePopup.delete');
    delBtn.addEventListener('mousedown', event => { event.preventDefault(); deleteFootnotePopupNode(); });
    actions.appendChild(delBtn);
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'v2-footnote-popup-ok';
    okBtn.textContent = I18n.t('footnotePopup.ok');
    okBtn.addEventListener('mousedown', event => { event.preventDefault(); commitFootnotePopup(); });
    actions.appendChild(okBtn);
    footnotePopupBox.appendChild(actions);
    footnotePopupBox._textarea = textarea;
    document.body.appendChild(footnotePopupBox);
    return footnotePopupBox;
  }
  function commitFootnotePopup() {
    const box = footnotePopupBox;
    if (!box || box.style.display === 'none') return;
    const pos = footnotePopupPos;
    footnotePopupPos = null;
    box.style.display = 'none';
    if (pos == null) return;
    const current = editor.state.doc.nodeAt(pos);
    if (!current || current.type.name !== 'footnoteRef') return;
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, Object.assign({}, current.attrs, { text: box._textarea.value }));
    editor.view.dispatch(tr);
  }
  // Retire le nœud footnoteRef lui-même (pas seulement son texte) - lu via getPos()-équivalent au moment du clic (footnotePopupPos), jamais une position mise
  // en cache d'avant : le document a pu changer entre l'ouverture et ce clic (texte tapé ailleurs, etc.).
  function deleteFootnotePopupNode() {
    const box = footnotePopupBox;
    const pos = footnotePopupPos;
    footnotePopupPos = null;
    if (box) box.style.display = 'none';
    if (pos == null) return;
    const current = editor.state.doc.nodeAt(pos);
    if (!current || current.type.name !== 'footnoteRef') return;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + current.nodeSize));
  }
  function openFootnoteEditorAt(pos) {
    const box = ensureFootnotePopupBox();
    if (footnotePopupPos != null && footnotePopupPos !== pos) commitFootnotePopup();
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'footnoteRef') {
      console.warn('[Editor] openFootnoteEditorAt(' + pos + ') : aucun nœud footnoteRef à cette position (trouvé : ' + (node && node.type && node.type.name) + ') - popup non ouverte.');
      return;
    }
    footnotePopupPos = pos;
    box._textarea.value = node.attrs.text || '';
    // Bornée à la zone visible (jamais hors champ) ; toute erreur de mesure retombe sur un positionnement générique plutôt que de bloquer l'ouverture.
    try {
      const dom = editor.view.nodeDOM(pos);
      const anchor = (dom && dom.getBoundingClientRect) ? dom : editor.view.dom;
      const rect = anchor.getBoundingClientRect();
      const boxWidth = 240; // cf. #v2-footnote-popup { width: 240px } (editor-v2.css)
      const boxHeightEstimate = 130;
      let left = rect.left + window.scrollX;
      let top = rect.bottom + window.scrollY + 4;
      // Math.max garantit maxLeft/Top >= minLeft/Top même dans un panneau très étroit, pour ne jamais clamper à une position pire que l'origine.
      const minLeft = window.scrollX + 4;
      const minTop = window.scrollY + 4;
      const maxLeft = Math.max(minLeft, window.scrollX + window.innerWidth - boxWidth - 8);
      const maxTop = Math.max(minTop, window.scrollY + window.innerHeight - boxHeightEstimate - 8);
      left = Math.min(Math.max(left, minLeft), maxLeft);
      top = Math.min(Math.max(top, minTop), maxTop);
      box.style.position = 'absolute';
      box.style.left = left + 'px';
      box.style.top = top + 'px';
    } catch (e) {
      console.warn('[Editor] positionnement du popup de note échoué, repli générique :', e);
      box.style.position = 'fixed';
      box.style.left = '40%';
      box.style.top = '30%';
    }
    box.style.display = 'block';
    // setTimeout(...,0), pas un appel synchrone : le mousedown déclencheur fait reprendre le focus sur .tiptap par ProseMirror juste après le retour de cette
    // fonction - un focus() synchrone ici serait écrasé.
    setTimeout(() => { box._textarea.focus(); }, 0);
  }

  // Image collée depuis le presse-papiers, convertie en data URI (forme requise par pdf-export.js) avant insertion.
  function readFileAsDataUri(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('FileReader a échoué'));
      reader.readAsDataURL(file);
    });
  }
  async function pasteImageFile(file) {
    let dataUri;
    try {
      dataUri = await readFileAsDataUri(file);
    } catch (e) {
      console.warn('[Editor] image collée illisible :', e);
      return;
    }
    await insertImageAtDefaultSize(dataUri);
  }

  // Tant qu'une colonne reste "auto" (sans `colwidth`), le tableau garde `width:100%` et une poignée de bord droit ne peut jamais l'agrandir ; on gèle donc
  // la largeur rendue de chaque colonne "auto" dès le premier redimensionnement, pour libérer le `width` exact du tableau.
  function backfillAutoColumnWidths(currentEditor) {
    const { state, view } = currentEditor;
    let tr = null;
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'table') return true;
      const firstRow = node.firstChild;
      if (!firstRow) return false;
      let hasExplicit = false; let hasAuto = false;
      firstRow.forEach(cellNode => { if (cellNode.attrs.colwidth) hasExplicit = true; else hasAuto = true; });
      if (!hasExplicit || !hasAuto) return false;
      node.forEach((rowNode, rowOffset) => {
        rowNode.forEach((cellNode, cellOffset) => {
          if (cellNode.attrs.colwidth) return;
          const cellPos = pos + 1 + rowOffset + 1 + cellOffset;
          const dom = view.nodeDOM(cellPos);
          if (!dom || !dom.getBoundingClientRect) return;
          const span = cellNode.attrs.colspan || 1;
          const widthPx = Math.max(DEFAULT_COL_PX, Math.round(dom.getBoundingClientRect().width / span));
          if (!tr) tr = state.tr;
          tr.setNodeMarkup(cellPos, undefined, Object.assign({}, cellNode.attrs, { colwidth: Array(span).fill(widthPx) }));
        });
      });
      return false;
    });
    if (tr) currentEditor.view.dispatch(tr);
  }

  const DEFAULT_COL_PX = 25;
  // Un <col> à largeur explicite n'a pas de plafond naturel (contrairement à min-width) : rétrécit après coup les colonnes redimensionnées quand le tableau
  // dépasse la page en Aperçu A4 (léger rebond au relâcher, tolérable).
  function clampOverflowingTables(currentEditor) {
    const editorContainer = document.getElementById('editor-container');
    if (!editorContainer || !editorContainer.classList.contains('a4-preview')) return;
    const containerWidth = EditorCore.editorContentWidthPx(currentEditor);
    if (!containerWidth) return;
    const { state } = currentEditor;
    let tr = null;
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'table') return true;
      const firstRow = node.firstChild;
      if (!firstRow) return false;
      // Calculé sur la première ligne, mais appliqué à TOUTES : sinon prosemirror-tables (largeur cohérente par colonne exigée) annule la correction pour la
      // réaligner sur les lignes non corrigées.
      let total = 0;
      firstRow.forEach(cellNode => {
        const span = cellNode.attrs.colspan || 1;
        const colwidth = cellNode.attrs.colwidth;
        total += colwidth ? colwidth.reduce((sum, w) => sum + (w || DEFAULT_COL_PX), 0) : DEFAULT_COL_PX * span;
      });
      if (total <= containerWidth) return false;
      const scale = containerWidth / total;
      node.forEach((rowNode, rowOffset) => {
        rowNode.forEach((cellNode, cellOffset) => {
          const colwidth = cellNode.attrs.colwidth;
          if (!colwidth) return; // colonne "auto" par défaut - laissée telle quelle
          const newColwidth = colwidth.map(w => (w ? Math.max(DEFAULT_COL_PX, Math.round(w * scale)) : w));
          const cellPos = pos + 1 + rowOffset + 1 + cellOffset;
          if (!tr) tr = state.tr;
          tr.setNodeMarkup(cellPos, undefined, Object.assign({}, cellNode.attrs, { colwidth: newColwidth }));
        });
      });
      return false;
    });
    if (tr) currentEditor.view.dispatch(tr);
  }


  async function init() {
    const { Editor: TiptapEditor, Extension, Node, mergeAttributes } = await import('@tiptap/core');
    const { StarterKit } = await import('@tiptap/starter-kit');
    const { TextAlign } = await import('@tiptap/extension-text-align');
    const { TextStyle } = await import('@tiptap/extension-text-style');
    const { FontFamily } = await import('@tiptap/extension-font-family');
    const { Suggestion } = await import('@tiptap/suggestion');
    const { Table } = await import('@tiptap/extension-table');
    const { TableRow } = await import('@tiptap/extension-table-row');
    const { TableCell } = await import('@tiptap/extension-table-cell');
    const { TableHeader } = await import('@tiptap/extension-table-header');
    const { TaskList } = await import('@tiptap/extension-task-list');
    const { TaskItem } = await import('@tiptap/extension-task-item');
    const { computePosition, offset, flip, shift, autoUpdate } = await import('@floating-ui/dom');
    EditorCore.setFloatingUi({ computePosition, offset, flip, shift, autoUpdate });
    let EditorStateClass;
    const { NodeSelection, TextSelection, EditorState } = await import('prosemirror-state');
    EditorCore.setNodeSelectionClass(NodeSelection);
    EditorCore.setTextSelectionClass(TextSelection);
    EditorStateClass = EditorState;

    const VarBadge = EditorNodes.createVarBadgeNode(Node, mergeAttributes);
    const PageNumberBadge = EditorNodes.createPageNumberBadgeNode(Node, mergeAttributes);
    const SmartChip = EditorNodes.createSmartChipNode(Node, mergeAttributes);
    const FootnoteRef = EditorNodes.createFootnoteRefNode(Node, mergeAttributes);
    const FontSize = EditorNodes.createFontSizeExtension(Extension);
    const TextColor = EditorNodes.createTextColorExtension(Extension);
    const HighlightColor = EditorNodes.createHighlightExtension(Extension);
    const BulletStyle = EditorNodes.createBulletStyleExtension(Extension);
    const OrderedListStyle = EditorNodes.createOrderedListStyleExtension(Extension);
    const TaskListStyle = EditorNodes.createTaskListStyleExtension(Extension);
    const TableHeaderWithBg = EditorNodes.withCellBackground(TableHeader);
    const TableCellWithBg = EditorNodes.withCellBackground(TableCell);
    const { TwoColumnsColumn, TwoColumnsZone } = EditorNodes.createTwoColumnsNodes(Node, mergeAttributes);
    const EditorImage = EditorNodes.createEditorImageNode(Node);
    const PageBreak = EditorNodes.createPageBreakNode(Node);
    const HeadingNumberingConfig = EditorNodes.createHeadingNumberingConfigNode(Node);
    const Toc = EditorNodes.createTocNode(Node);

    editor = new TiptapEditor({
      element: document.getElementById('editor-container'),
      onUpdate: ({ editor: updatedEditor }) => { backfillAutoColumnWidths(updatedEditor); clampOverflowingTables(updatedEditor); HeaderFooterPreview.schedulePaginationRecompute(); refreshVariableBadgeValidity(); },
      // Ne consomme que si le presse-papiers contient réellement une image ; un collage de texte normal suit le traitement natif de ProseMirror.
      editorProps: {
        handlePaste(view, event) {
          const items = Array.from((event.clipboardData && event.clipboardData.items) || []);
          const imageItem = items.find(item => item.kind === 'file' && item.type && item.type.startsWith('image/'));
          if (!imageItem) return false;
          const file = imageItem.getAsFile();
          if (!file) return false;
          event.preventDefault();
          pasteImageFile(file);
          return true;
        },
      },
      extensions: [
        StarterKit,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TextStyle,
        FontFamily,
        FontSize,
        TextColor,
        HighlightColor,
        BulletStyle,
        OrderedListStyle,
        TaskList,
        TaskItem.configure({ nested: false }),
        TaskListStyle,
        VarBadge,
        PageNumberBadge,
        SmartChip,
        FootnoteRef,
        Variables.createExtension(Extension, Suggestion),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeaderWithBg,
        TableCellWithBg,
        TwoColumnsColumn,
        TwoColumnsZone,
        EditorImage,
        PageBreak,
        HeadingNumberingConfig,
        Toc,
        EditorNodes.createTabNavigationExtension(Extension),
        EditorNodes.createClearHistoryExtension(Extension, EditorStateClass),
      ],
      content: '',
    });
    EditorCore.setEditor(editor);
    HeaderFooterPreview.setEditor(editor);

    // Enveloppe posée une seule fois, jamais recréée ensuite (renderPaginationOverlay relit juste tiptapEl.parentElement) : porte le fond/liseré "page" en
    // Aperçu A4 pour que les zones d'en-tête/pied restent visuellement collées au corps.
    const pageSheet = document.createElement('div');
    pageSheet.className = 'v2-page-sheet';
    editor.view.dom.parentNode.insertBefore(pageSheet, editor.view.dom);
    pageSheet.appendChild(editor.view.dom);

    FloatingToolbars.setEditor(editor);
    MainToolbar.setEditor(editor);
    MainToolbar.wireToolbar();
    FloatingToolbars.wireColorPickers();
    FloatingToolbars.wireTableFloatingToolbar();
    FloatingToolbars.wireImageFloatingToolbar();
    FloatingToolbars.wireVariableFloatingToolbar();
    editor.on('selectionUpdate', MainToolbar.syncToolbarState);
    editor.on('transaction', MainToolbar.syncToolbarState);
    window.addEventListener('resize', HeaderFooterPreview.schedulePaginationRecompute);
    return editor;
  }

  function getHTML() { return editor ? editor.getHTML() : ''; }

  function getHeadingNumberingStyle() {
    if (!editor) return 'none';
    let style = 'none';
    editor.state.doc.forEach(node => { if (node.type.name === 'headingNumberingConfig') style = node.attrs.numberingStyle; });
    return style;
  }

  // Signale les badges #Variable dont la table/colonne n'existe plus : simple classe+title sur le <span> rendu, jamais un attribut du nœud (dépend d'un état
  // externe, pas du contenu) - ProseMirror peut reconstruire ce span à tout moment, donc rejoué à chaque déclencheur pertinent plutôt que posé une fois.
  function refreshVariableBadgeValidity() {
    if (!editor) return;
    editor.view.dom.querySelectorAll('span.var-badge').forEach(el => {
      const table = el.dataset.table;
      const column = el.dataset.column;
      let reason = '';
      if (table && GristAPI.getTables().indexOf(table) === -1) {
        reason = `La table « ${table} » n'existe plus dans ce document.`;
      } else if (table && column && GristAPI.getColumns(table).indexOf(column) === -1) {
        reason = `La colonne « ${column} » n'existe plus dans la table « ${table} ».`;
      }
      el.classList.toggle('var-badge-broken', !!reason);
      if (reason) el.title = reason; else el.removeAttribute('title');
    });
  }

  function setHTML(html) {
    if (!editor) return;
    editor.commands.setContent(html || '', { emitUpdate: false });
    // Sans ça l'historique Annuler/Rétablir s'accumule à travers les changements de modèle : un Annuler après chargement pouvait faire réapparaître le
    // contenu d'un modèle précédent (bug confirmé).
    editor.commands.clearHistory();
    editor.view.dom.dataset.headingStyle = getHeadingNumberingStyle();
    // Force un rafraîchissement du NodeView du sommaire : son premier rendu (pendant setContent) a eu lieu avant que headingStyle soit posé ci-dessus.
    editor.view.dispatch(editor.state.tr);
    // Le dispatch ci-dessus ne déclenche pas onUpdate (pas de changement réel), donc clampOverflowingTables ne tourne pas seul pour un tableau déjà trop
    // large importé - appelé explicitement ici pour couvrir ce cas.
    backfillAutoColumnWidths(editor);
    clampOverflowingTables(editor);
    HeaderFooterPreview.renderPaginationOverlay();
    // Vérification immédiate (schéma en cache) puis après rafraîchissement explicite (couvre une table/colonne supprimée entretemps).
    refreshVariableBadgeValidity();
    GristAPI.refreshSchema().then(refreshVariableBadgeValidity)
      .catch(e => console.warn('[Editor] refreshSchema pour la validation des #Variable a échoué', e));
  }

  return {
    init, getHTML, setHTML, getHeadingNumberingStyle, insertImageAtDefaultSize,
    getHeaderFooterData: HeaderFooterPreview.getHeaderFooterData,
    setHeaderFooterData: HeaderFooterPreview.setHeaderFooterData,
    exitHeaderFooterModeIfActive: HeaderFooterPreview.exitHeaderFooterModeIfActive,
    refreshPaginationPreview: HeaderFooterPreview.renderPaginationOverlay,
    openFootnoteEditorAt,
    isEditingHeaderFooter: HeaderFooterPreview.isEditingHeaderFooter,
  };
})();
