// Éditeur — TipTap/ProseMirror. Script classique (pas type="module") : TipTap/ProseMirror chargés via import() dynamique dans init(), pour garder le partage
// de portée globale avec GristAPI/Templates/ReaderMode ; nœuds/extensions construits par des createXxx(...) (classes TipTap indisponibles avant cet import).
const Editor = (function () {
  let editor = null;
  let currentAlign = 'left';

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
    wireToolbar();
    FloatingToolbars.wireColorPickers();
    FloatingToolbars.wireTableFloatingToolbar();
    FloatingToolbars.wireImageFloatingToolbar();
    FloatingToolbars.wireVariableFloatingToolbar();
    editor.on('selectionUpdate', syncToolbarState);
    editor.on('transaction', syncToolbarState);
    window.addEventListener('resize', HeaderFooterPreview.schedulePaginationRecompute);
    return editor;
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
      await insertImageAtDefaultSize(url);
      warnIfImageUrlNotExportable(url);
    });
    bind('v2-btn-image-from-variable', () => openImageVariablePicker(document.getElementById('v2-btn-image-from-variable')));
    bind('v2-btn-page-break', () => editor.chain().focus().insertPageBreak().run());
    bind('v2-btn-toc', () => editor.chain().focus().insertToc().run());
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
    init, getHTML, setHTML, getHeadingNumberingStyle,
    getHeaderFooterData: HeaderFooterPreview.getHeaderFooterData,
    setHeaderFooterData: HeaderFooterPreview.setHeaderFooterData,
    exitHeaderFooterModeIfActive: HeaderFooterPreview.exitHeaderFooterModeIfActive,
    refreshPaginationPreview: HeaderFooterPreview.renderPaginationOverlay,
    openFootnoteEditorAt,
    isEditingHeaderFooter: HeaderFooterPreview.isEditingHeaderFooter,
    // Temporaire (étape 2/5 du découpage) : syncToolbarState migre vers main-toolbar.js à l'étape 5, header-footer-preview.js l'appelle d'ici là via
    // Editor.syncToolbarState plutôt que MainToolbar.syncToolbarState (qui n'existe pas encore).
    syncToolbarState,
  };
})();
