// Éditeur — TipTap/ProseMirror. Script classique (pas type="module") : TipTap/ProseMirror chargés via import() dynamique dans init(), pour garder le partage
// de portée globale avec GristAPI/Templates/ReaderMode ; nœuds/extensions construits par des createXxx(...) (classes TipTap indisponibles avant cet import).
const Editor = (function () {
  let editor = null;
  // Suivi des modifications : métadonnée (auteur/horodatage) par id de suggestion en attente, hors
  // du document ProseMirror lui-même (l'id suffit à l'ancrer dans le HTML) - voyage dans la colonne
  // Grist SuiviModifications, dans le MÊME UpdateRecord que Contenu (planning/feature-track-
  // changes.md, décision n°4). Repartie de zéro à chaque chargement de modèle (setHTML), jamais
  // conservée d'un modèle à l'autre.
  let suiviMetadataCache = {};
  // API renvoyée par TrackChanges.createExtensions() (js/track-changes.js), construite une fois dans
  // init() - isSuggestModeOn a besoin des fonctions de la lib, importées dynamiquement là-bas.
  let trackChangesApi = null;
  let tableTools = null; // { selectedRect, isInTable } de prosemirror-tables, posés par init()

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
    Layers.raise(box); // au-dessus de ce qui est déjà ouvert (barre flottante du tableau ou de l'image), js/layers.js
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

  // Applique une correction de largeurs de colonnes lancée depuis onUpdate (les deux fonctions ci-dessous mesurent le DOM, donc ne peuvent pas passer par
  // un appendTransaction). Rangée à part, elle formait son propre événement d'historique : Annuler ne défaisait que la correction, qu'onUpdate rejouait
  // aussitôt (l'état rétabli redevient "à corriger"), et l'action d'origine - ajout d'une colonne, glissement d'une bordure - ne pouvait plus jamais
  // être annulée dans un tableau qui a des largeurs. `appendedTransaction` est le contrat que ProseMirror pose lui-même sur les transactions d'un
  // appendTransaction : prosemirror-history les range dans l'événement de la transaction racine, y compris pendant un Annuler/Rétablir. Sans transaction
  // d'origine (chargement d'un modèle, changement de marges) la correction ne vient pas d'un geste de la personne : hors historique.
  function dispatchColumnWidthFix(currentEditor, tr, trigger) {
    if (trigger) tr.setMeta('appendedTransaction', trigger.getMeta('appendedTransaction') || trigger);
    else tr.setMeta('addToHistory', false);
    // Avec le suivi, ces largeurs ne sont pas une modification de la personne mais le widget qui remet le tableau d'aplomb : suivies, elles posaient une marque
    // « modification » sur chaque case, et sur la case d'une colonne ajoutée elle remplaçait la marque « insertion » (la colonne ne pouvait plus être refusée).
    TrackChanges.skipTracking(tr);
    currentEditor.view.dispatch(tr);
  }

  // Tant qu'une colonne reste "auto" (sans `colwidth`), le tableau garde `width:100%` et une poignée de bord droit ne peut jamais l'agrandir ; on gèle donc
  // la largeur rendue de chaque colonne "auto" dès le premier redimensionnement, pour libérer le `width` exact du tableau.
  function backfillAutoColumnWidths(currentEditor, trigger) {
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
          // Éditeur masqué (Lecture, macro-modèle) : la largeur mesurée vaut 0 et geler la colonne dessus la ramènerait au plancher de 25 px ci-dessous.
          // Rejoué quand l'éditeur redevient visible (refreshLayout).
          const renderedWidth = dom.getBoundingClientRect().width;
          if (!(renderedWidth > 0)) return;
          const span = cellNode.attrs.colspan || 1;
          const widthPx = Math.max(DEFAULT_COL_PX, Math.round(renderedWidth / span));
          if (!tr) tr = state.tr;
          tr.setNodeMarkup(cellPos, undefined, Object.assign({}, cellNode.attrs, { colwidth: Array(span).fill(widthPx) }));
        });
      });
      return false;
    });
    if (tr) dispatchColumnWidthFix(currentEditor, tr, trigger);
  }

  const DEFAULT_COL_PX = 25;
  // Un <col> à largeur explicite n'a pas de plafond naturel (contrairement à min-width) : rétrécit après coup les colonnes redimensionnées quand le tableau
  // dépasse la page en Aperçu A4 (léger rebond au relâcher, tolérable).
  function clampOverflowingTables(currentEditor, trigger) {
    const editorContainer = document.getElementById('editor-container');
    if (!editorContainer || !editorContainer.classList.contains('a4-preview')) return;
    const containerWidth = EditorCore.editorContentWidthPx(currentEditor);
    // 0 : éditeur masqué (Lecture, macro-modèle), rien à mesurer - les largeurs restent celles du modèle. Rejoué quand l'éditeur redevient visible
    // (refreshLayout). Calculé sur une largeur négative, le facteur ci-dessous ramenait toutes les colonnes à 25 px.
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
    if (tr) dispatchColumnWidthFix(currentEditor, tr, trigger);
  }


  async function init() {
    // Les 14 modules ci-dessous n'ont aucune dépendance d'ordre entre eux (chacun n'alimente que sa propre variable, aucun n'est lu avant la construction
    // des extensions plus bas) - chargés en parallèle plutôt qu'en 14 `await` séquentiels : un `import()` est une requête réseau vers esm.sh, la cascade
    // ajoutait jusqu'à 1-2s au démarrage sur une connexion lente/cache froid (audit de performance 2026-09-14).
    const [
      { Editor: TiptapEditor, Extension, Node, Mark, mergeAttributes, InputRule },
      { StarterKit },
      { TextAlign },
      { TextStyle },
      { FontFamily },
      { Suggestion },
      { Document },
      { Table },
      { TableRow },
      { TableCell },
      { TableHeader },
      { TaskList },
      { TaskItem },
      { Placeholder },
      { computePosition, offset, flip, shift, autoUpdate },
      { NodeSelection, TextSelection, EditorState, Plugin, PluginKey },
      { Decoration, DecorationSet },
      { TableMap, CellSelection, selectedRect, isInTable },
    ] = await Promise.all([
      import('@tiptap/core'),
      import('@tiptap/starter-kit'),
      import('@tiptap/extension-text-align'),
      import('@tiptap/extension-text-style'),
      import('@tiptap/extension-font-family'),
      import('@tiptap/suggestion'),
      import('@tiptap/extension-document'),
      import('@tiptap/extension-table'),
      import('@tiptap/extension-table-row'),
      import('@tiptap/extension-table-cell'),
      import('@tiptap/extension-table-header'),
      import('@tiptap/extension-task-list'),
      import('@tiptap/extension-task-item'),
      import('@tiptap/extension-placeholder'),
      import('@floating-ui/dom'),
      import('prosemirror-state'),
      import('prosemirror-view'),
      import('prosemirror-tables'),
    ]);
    EditorCore.setFloatingUi({ computePosition, offset, flip, shift, autoUpdate });
    GridEditor.configure({ Plugin, PluginKey, TextSelection, Decoration, DecorationSet, TableMap, CellSelection });
    tableTools = { selectedRect, isInTable };
    let EditorStateClass;
    EditorCore.setNodeSelectionClass(NodeSelection);
    EditorCore.setTextSelectionClass(TextSelection);
    EditorStateClass = EditorState;

    const VarBadge = EditorNodes.createVarBadgeNode(Node, mergeAttributes);
    const PageNumberBadge = EditorNodes.createPageNumberBadgeNode(Node, mergeAttributes);
    const SmartChip = EditorNodes.createSmartChipNode(Node, mergeAttributes);
    const FootnoteRef = EditorNodes.createFootnoteRefNode(Node, mergeAttributes);
    const CommentMark = EditorNodes.createCommentMark(Mark, mergeAttributes);
    const FontSize = EditorNodes.createFontSizeExtension(Extension);
    const TextColor = EditorNodes.createTextColorExtension(Extension);
    const HighlightColor = EditorNodes.createHighlightExtension(Extension);
    const BulletStyle = EditorNodes.createBulletStyleExtension(Extension);
    const OrderedListStyle = EditorNodes.createOrderedListStyleExtension(Extension);
    const TaskListStyle = EditorNodes.createTaskListStyleExtension(Extension);
    const TableHeaderWithBg = EditorNodes.withCellBackground(GridEditor.withCellAttributes(TableHeader));
    const TableCellWithBg = EditorNodes.withCellBackground(GridEditor.withCellAttributes(TableCell));
    const { TwoColumnsColumn, TwoColumnsZone } = EditorNodes.createTwoColumnsNodes(Node, mergeAttributes);
    const ConditionalText = EditorNodes.createConditionalTextNode(Node, mergeAttributes);
    const ConditionalCheckboxNode = EditorNodes.createConditionalCheckboxNode(Node, mergeAttributes);
    const EditorImage = EditorNodes.createEditorImageNode(Node);
    const PageBreak = EditorNodes.createPageBreakNode(Node);
    const HeadingNumberingConfig = EditorNodes.createHeadingNumberingConfigNode(Node);
    const Toc = EditorNodes.createTocNode(Node);

    // Suivi des modifications (planning/feature-track-changes.md) : `doc` et tout conteneur de bloc
    // dont un enfant direct peut être supprimé/inséré EN BLOC (pas seulement son texte) doivent
    // explicitement autoriser les 3 marques de suivi via `.extend({marks: '...'})`, sans quoi
    // ProseMirror lève "Invalid content for node X" dès la première suppression de bloc entier sous
    // suivi actif - cf. js/track-changes.js. StarterKit embarque son propre `Document` (jamais
    // extensible depuis l'extérieur) - `document: false` le désactive pour lui substituer la version
    // étendue ci-dessous, seule différence avec l'usage par défaut de StarterKit.
    trackChangesApi = await TrackChanges.createExtensions(Node, Mark, Extension, mergeAttributes);
    const TrackedDocument = TrackChanges.extendForTracking(Document);
    const TrackedTable = TrackChanges.extendForTracking(Table);
    // La ligne aussi : « Colonne avant / après » et « Supprimer la colonne » posent une marque sur chaque CASE de la colonne, des enfants directs d'une ligne.
    const TrackedTableRow = TrackChanges.extendForTracking(GridEditor.withRowAttributes(TableRow));
    const TrackedTableHeaderWithBg = TrackChanges.extendForTracking(TableHeaderWithBg);
    const TrackedTableCellWithBg = TrackChanges.extendForTracking(TableCellWithBg);
    const TrackedTwoColumnsColumn = TrackChanges.extendForTracking(TwoColumnsColumn);
    const TrackedTwoColumnsZone = TrackChanges.extendForTracking(TwoColumnsZone);
    // Encadré (js/callout.js) : un bloc qui contient des blocs, comme une colonne - il doit donc, lui aussi, accepter les marques de suivi sur ses enfants.
    const TrackedCallout = TrackChanges.extendForTracking(Callout.createNode(Node, mergeAttributes));
    const TrackedConditionalText = TrackChanges.extendForTracking(ConditionalText);

    editor = new TiptapEditor({
      element: document.getElementById('editor-container'),
      onUpdate: ({ editor: updatedEditor, transaction }) => { HeaderFooterPreview.enforceZoneHeightLimit(updatedEditor, transaction); backfillAutoColumnWidths(updatedEditor, transaction); clampOverflowingTables(updatedEditor, transaction); HeaderFooterPreview.schedulePaginationRecompute(); refreshVariableBadgeValidity(); },
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
        // Liens (js/link-dialog.js) : un clic place le curseur (Ctrl/⌘+clic ouvre le lien) ; une adresse tapée sans schéma prend https, plus http.
        StarterKit.configure({ document: false, link: { openOnClick: false, defaultProtocol: 'https' } }),
        TrackedDocument,
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
        // includeChildren volontairement PAS activé (défaut false) : un placeholder par cellule de tableau/colonne vide encombrerait l'écran de
        // plusieurs textes gris à la fois - seul le document principal, pris dans son ensemble, doit en montrer un. `placeholder` en fonction (pas une
        // chaîne figée à la construction) pour deux raisons à la fois : (1) l'extension relit cette fonction à CHAQUE recalcul de décoration (donc à
        // chaque frappe/sélection), un simple I18n.t() dedans suit un changement de langue en cours de session sans avoir besoin de I18n.onChange ; (2)
        // ce même éditeur sert aussi à éditer un en-tête/pied de page vide (contenu échangé via setContent, cf. header-footer-preview.js) - le message
        // "Commencez à écrire votre modèle ici…" y serait trompeur (l'utilisateur n'édite pas le document principal), donc rien n'y est affiché.
        Placeholder.configure({ placeholder: () => (HeaderFooterPreview.isEditingHeaderFooter() ? '' : I18n.t('editor.placeholder')) }),
        VarBadge,
        PageNumberBadge,
        SmartChip,
        FootnoteRef,
        CommentMark,
        trackChangesApi.InsertionMark,
        trackChangesApi.DeletionMark,
        trackChangesApi.ModificationMark,
        trackChangesApi.SuggestChangesBridge,
        Variables.createExtension(Extension, Suggestion),
        TextExpansion.createExtension(Extension, Suggestion, InputRule, PluginKey),
        LinkDialog.createExtension(Extension),
        // Rechercher / Remplacer (js/find-replace.js) : surlignage des résultats par décorations (Ctrl+F et Ctrl+H sont écoutés sur le document, cf. wireEditor).
        FindReplace.createExtension(Extension, { Plugin, PluginKey, Decoration, DecorationSet }),
        TrackedTable.configure({ resizable: true }),
        TrackedTableRow,
        TrackedTableHeaderWithBg,
        TrackedTableCellWithBg,
        TrackedTwoColumnsColumn,
        TrackedTwoColumnsZone,
        TrackedCallout,
        TrackedConditionalText,
        ConditionalCheckboxNode,
        EditorImage,
        PageBreak,
        HeadingNumberingConfig,
        Toc,
        EditorNodes.createTabNavigationExtension(Extension),
        EditorNodes.createClearHistoryExtension(Extension, EditorStateClass),
        GridEditor.createExtension(Extension),
      ],
      content: '',
    });
    EditorCore.setEditor(editor);
    trackChangesApi.installSerializer(editor.schema);
    HeaderFooterPreview.setEditor(editor);

    // Enveloppe posée une seule fois, jamais recréée ensuite (renderPaginationOverlay relit juste tiptapEl.parentElement) : porte le fond/liseré "page" en
    // Aperçu A4 pour que les zones d'en-tête/pied restent visuellement collées au corps.
    const pageSheet = document.createElement('div');
    pageSheet.className = 'v2-page-sheet';
    editor.view.dom.parentNode.insertBefore(pageSheet, editor.view.dom);
    pageSheet.appendChild(editor.view.dom);
    GridEditor.attach(editor);
    TableSelect.attach(editor);

    FloatingToolbars.setEditor(editor);
    MainToolbar.setEditor(editor);
    MainToolbar.wireToolbar();
    LinkDialog.wireEditor(editor);
    FindReplace.wireEditor(editor);
    FloatingToolbars.wireColorPickers();
    FloatingToolbars.wireTableFloatingToolbar();
    FloatingToolbars.wireImageFloatingToolbar();
    FloatingToolbars.wireVariableFloatingToolbar();
    Comments.setEditor(editor);
    Comments.wireClickToOpen();
    editor.on('selectionUpdate', MainToolbar.syncToolbarState);
    editor.on('transaction', MainToolbar.syncToolbarState);
    // Le placeholder (ci-dessus) relit I18n.t() à chaque recalcul de décoration, mais ce recalcul est piloté par ProseMirror (sur chaque transaction),
    // jamais par I18n lui-même - changer de langue pendant que l'éditeur est vide ne redessine donc rien tout seul (aucune transaction n'a eu lieu).
    // Un dispatch de transaction VIDE (mêmes idiome que setHTML plus bas) force ce recalcul sans toucher au document, juste pour ce cas précis.
    I18n.onChange(() => { if (editor) editor.view.dispatch(editor.state.tr); });
    window.addEventListener('resize', HeaderFooterPreview.schedulePaginationRecompute);
    return editor;
  }

  // Une grille s'enregistre et s'exporte sans le paragraphe vide caché sous son tableau (GridEditor.serialize).
  function getHTML() { return editor ? GridEditor.serialize(editor.getHTML()) : ''; }

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
      } else if (table && column && column.indexOf('.') !== -1) {
        // Bulle qui descend de référence en référence (« Accompagnateur.Email ») : chaque maillon doit exister et, sauf le dernier, être une Référence.
        if (!GristAPI.resolveColumnPath(table, column)) reason = I18n.t('varBadge.brokenPath', { column, table });
      } else if (table && column && GristAPI.getColumns(table).indexOf(column) === -1) {
        reason = `La colonne « ${column} » n'existe plus dans la table « ${table} ».`;
      }
      el.classList.toggle('var-badge-broken', !!reason);
      if (reason) el.title = reason; else el.removeAttribute('title');
    });
  }

  // suiviModifications : métadonnée { [id]: {author, createdAt} } relue depuis la colonne Grist du
  // modèle (null pour un modèle jamais suivi, ou de type macro - cf. js/templates.js). `setContent`
  // remplacé par `loadTrackedDocument` (js/track-changes.js) : le suivi peut être actif au moment de
  // ce chargement (rien ne l'aurait désactivé entre deux modèles), et un `setContent` normal y serait
  // intercepté par le pont Tiptap comme une suggestion géante, doublant tout le contenu au lieu de le
  // remplacer (planning/feature-track-changes.md, bug n°5).
  function setHTML(html, suiviModifications) {
    if (!editor) return;
    suiviMetadataCache = suiviModifications || {};
    const wasTrackChangesOn = isTrackChangesOn();
    editor.commands.loadTrackedDocument(html || '');
    // Sans ça l'historique Annuler/Rétablir s'accumule à travers les changements de modèle : un Annuler après chargement pouvait faire réapparaître le
    // contenu d'un modèle précédent (bug confirmé).
    editor.commands.clearHistory();
    // clearHistory() reconstruit l'état ProseMirror via EditorState.create(), qui réinitialise l'état de TOUS les plugins (pas seulement l'historique
    // Annuler/Rétablir qu'elle vise) - le mode suivi (un booléen de plugin, jamais stocké dans le document) repasserait sinon silencieusement à OFF à
    // chaque changement de modèle, y compris en rechargeant le même. Cf. commentaire de TrackChanges.restoreSuggestModeIfNeeded (js/track-changes.js).
    trackChangesApi.restoreSuggestModeIfNeeded(editor, wasTrackChangesOn);
    editor.view.dom.dataset.headingStyle = getHeadingNumberingStyle();
    // Force un rafraîchissement du NodeView du sommaire : son premier rendu (pendant setContent) a eu lieu avant que headingStyle soit posé ci-dessus.
    editor.view.dispatch(editor.state.tr);
    // Le dispatch ci-dessus ne déclenche pas onUpdate (pas de changement réel), donc clampOverflowingTables ne tourne pas seul pour un tableau déjà trop
    // large importé - appelé explicitement ici pour couvrir ce cas.
    backfillAutoColumnWidths(editor);
    clampOverflowingTables(editor);
    HeaderFooterPreview.renderPaginationOverlay();
    HeaderFooterPreview.migrateLegacyImagePositions();
    // Vérification immédiate (schéma en cache) puis après rafraîchissement explicite (couvre une table/colonne supprimée entretemps).
    refreshVariableBadgeValidity();
    GristAPI.refreshSchema().then(refreshVariableBadgeValidity)
      .catch(e => console.warn('[Editor] refreshSchema pour la validation des #Variable a échoué', e));
  }

  // Appelé après un changement de marges de page (js/page-layout.js). Les zones 2-colonnes, elles, n'ont plus rien à recalculer en JS : `--layout-left`
  // porte désormais une LONGUEUR en mm en mode mm (cf. js/editor-nodes.js), que le moteur CSS réévalue tout seul quand le padding de `.tiptap` change.
  // Reste ce que CSS ne peut pas faire : la pagination affichée dépend de la hauteur de contenu d'une page, donc des marges haut/bas - sans ce
  // recalcul, les bandes de couture restaient figées sur la géométrie des marges PRÉCÉDENTES (le dispatch d'une transaction vide qui tenait lieu de
  // rafraîchissement ici ne déclenchait ni onUpdate ni la moindre réconciliation de NodeView : il ne servait à rien).
  // Rappelé aussi chaque fois que l'éditeur redevient visible (js/main.js:syncEditorVisibilityForMode) : un modèle chargé pendant qu'il était masqué (Lecture,
  // macro-modèle) n'a pu ni geler ses colonnes automatiques ni ramener un tableau trop large dans la page, ces deux mesures exigeant une mise en page réelle.
  function refreshLayout() {
    if (!editor) return;
    backfillAutoColumnWidths(editor);
    clampOverflowingTables(editor);
    // Les images en calque d'un ancien modèle chargé masqué n'ont pas pu recevoir leur position de page (cf. HeaderFooterPreview.migrateLegacyImagePositions) :
    // mesurées ici, une fois les largeurs de colonnes réglées, avec la mise en page que l'éditeur vient de retrouver.
    HeaderFooterPreview.migrateLegacyImagePositions();
    HeaderFooterPreview.schedulePaginationRecompute();
    GridEditor.refresh();
  }

  function isTrackChangesOn() {
    return !!editor && !!trackChangesApi && trackChangesApi.isSuggestModeOn(editor.state);
  }

  // Allume ou éteint le suivi sans passer par le bouton de la barre : une grille l'éteint à l'ouverture (js/grid-editor.js:setActive).
  function setTrackChanges(on) {
    if (!editor || !trackChangesApi || isTrackChangesOn() === !!on) return;
    trackChangesApi.toggleSuggestMode(editor);
  }

  // La ou les colonnes de la sélection sont-elles traversées par une case fusionnée en largeur ? Les supprimer revient à réduire la largeur de cette case ET à retirer les
  // autres cases de la colonne ; avec le suivi, le premier changement s'applique tout de suite et le second seulement à l'acceptation. Entre les deux le tableau n'est plus
  // rectangulaire et prosemirror-tables le « répare » en ajoutant des cases vides : le tableau accepté (ou refusé) n'a plus la forme voulue. La barre du tableau grise donc
  // « Supprimer la colonne » dans ce cas (js/floating-toolbars.js). Ajouter une colonne à travers une case fusionnée, lui, se résout proprement.
  function selectedColumnsCrossMergedCell() {
    if (!editor || !tableTools || !tableTools.isInTable(editor.state)) return false;
    const { map, left, right } = tableTools.selectedRect(editor.state);
    // Chaque ligne, colonne par colonne (cellsInRect, lui, ne rend pas les cases qui commencent avant `left`).
    for (let row = 0; row < map.height; row++) {
      for (let col = left; col < right; col++) {
        const cell = map.findCell(map.map[row * map.width + col]);
        if (cell.left < left || cell.right > right) return true;
      }
    }
    return false;
  }

  function hasPendingTrackedChanges() {
    return !!editor && TrackChanges.hasPendingSuggestions(editor.state);
  }

  // Auteur/horodatage par suggestion en attente (colonne Grist SuiviModifications, cf. commentaire de
  // suiviMetadataCache plus haut). Appelée juste avant chaque Templates.save() (Enregistrer manuel ET
  // auto-save, js/main.js) - jamais séparément, pour ne jamais écrire cette colonne hors du même
  // UpdateRecord que Contenu/DateModif (planning/feature-track-changes.md, exigence sur la fenêtre de
  // risque en cas de conflit). Repli anonyme silencieux si l'identification Grist échoue, même
  // convention que js/comments.js.
  async function getSuiviModificationsForSave() {
    if (!editor) return suiviMetadataCache;
    let author = null;
    try { author = await GristAPI.getCurrentUserEmail(); } catch (e) { /* repli anonyme silencieux */ }
    suiviMetadataCache = TrackChanges.computeMetadata(editor.state, suiviMetadataCache, author);
    return suiviMetadataCache;
  }

  return {
    init, getHTML, setHTML, getHeadingNumberingStyle, insertImageAtDefaultSize,
    getHeaderFooterData: HeaderFooterPreview.getHeaderFooterData,
    setHeaderFooterData: HeaderFooterPreview.setHeaderFooterData,
    exitHeaderFooterModeIfActive: HeaderFooterPreview.exitHeaderFooterModeIfActive,
    refreshPaginationPreview: HeaderFooterPreview.renderPaginationOverlay,
    refreshLayout,
    openFootnoteEditorAt,
    isEditingHeaderFooter: HeaderFooterPreview.isEditingHeaderFooter,
    isTrackChangesOn,
    setTrackChanges,
    hasPendingTrackedChanges,
    selectedColumnsCrossMergedCell,
    getSuiviModificationsForSave,
  };
})();
