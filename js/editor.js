// Éditeur — TipTap/ProseMirror. Script classique (pas type="module") : TipTap et ProseMirror sont chargés par import() dynamique dans
// loadLibraries(), ce qui garde la portée globale partagée avec GristAPI, Templates et ReaderMode. Nœuds et extensions sont construits par des
// createXxx(...) : les classes TipTap n'existent pas avant cet import.
const Editor = (function () {
  const el = Dom.el;
  let editor = null;
  // Suivi des modifications : auteur et horodatage par id de suggestion en attente, hors du document ProseMirror ; ils voyagent dans la colonne Grist
  // SuiviModifications (même UpdateRecord que Contenu, planning/feature-track-changes.md) et repartent de zéro à chaque setHTML.
  let suiviMetadataCache = {};
  // Qui est devant l'écran : { email, name }, lu une fois par session ; null avant la lecture ou si Grist ne le donne pas. Une lecture ratée n'est
  // retentée qu'après une minute par la barre (chaque lecture écrit dans la table interne), à chaque modification neuve par l'enregistrement.
  let currentAuthor = null;
  let currentAuthorRead = null;
  let currentAuthorFailedAt = 0;
  const AUTHOR_RETRY_MS = 60000;
  const authorListeners = [];
  // API de TrackChanges.createExtensions() (js/track-changes.js), construite dans init() : isSuggestModeOn a besoin des fonctions de la librairie.
  let trackChangesApi = null;
  let tableTools = null; // { selectedRect, isInTable } de prosemirror-tables, posés par init()

  async function insertImageAtDefaultSize(src) {
    // Partagée par le bouton toolbar et le collage presse-papiers (src = URL ou data URI).
    let width = 320;
    if (HeaderFooterPreview.getHfMode()) {
      try {
        const image = await ImageIo.load(src);
        width = HeaderFooterPreview.clampWidthForHfMaxSize(width, image.naturalWidth, image.naturalHeight);
      } catch (e) { /* repli sur 320px */ }
    }
    editor.chain().focus().insertImage({ src, alt: 'Image', width: Math.round(width) + 'px' }).run();
  }

  // Popup d'édition d'une note de bas de page. Une seule est active à la fois : en ouvrir une valide celle qui était ouverte (commitFootnotePopup).
  // Il ne se ferme que par une action explicite (OK, Supprimer, Échap, ouverture d'une autre note), jamais au clic extérieur.
  let footnotePopup = null; // { box, textarea }, créé à la première ouverture
  let footnotePopupPos = null;
  function ensureFootnotePopup() {
    if (footnotePopup) return footnotePopup;
    const textarea = el('textarea');
    textarea.rows = 3;
    textarea.placeholder = I18n.t('footnotePopup.placeholder');
    textarea.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); commitFootnotePopup(); }
    });
    const delBtn = Dom.button('v2-footnote-popup-delete', I18n.t('footnotePopup.delete'));
    delBtn.addEventListener('mousedown', event => { event.preventDefault(); deleteFootnotePopupNode(); });
    const okBtn = Dom.button('v2-footnote-popup-ok', I18n.t('footnotePopup.ok'));
    okBtn.addEventListener('mousedown', event => { event.preventDefault(); commitFootnotePopup(); });
    const actions = el('div', 'v2-footnote-popup-actions');
    actions.append(delBtn, okBtn);
    const box = el('div');
    box.id = 'v2-footnote-popup';
    box.style.display = 'none';
    box.append(textarea, actions);
    document.body.appendChild(box);
    footnotePopup = { box, textarea };
    return footnotePopup;
  }
  function closeFootnotePopup() {
    // Ferme le popup et rend le nœud footnoteRef qu'il éditait, relu au moment du clic (footnotePopupPos) : le document a pu changer depuis
    // l'ouverture (texte tapé ailleurs). Rien si le popup était fermé ou si le nœud n'existe plus.
    const pos = footnotePopupPos;
    footnotePopupPos = null;
    if (footnotePopup) footnotePopup.box.style.display = 'none';
    const node = pos == null ? null : editor.state.doc.nodeAt(pos);
    return node && node.type.name === 'footnoteRef' ? { pos, node } : null;
  }
  function commitFootnotePopup() {
    if (!footnotePopup || footnotePopup.box.style.display === 'none') return;
    const note = closeFootnotePopup();
    if (note) editor.view.dispatch(editor.state.tr.setNodeMarkup(note.pos, undefined, Object.assign({}, note.node.attrs, { text: footnotePopup.textarea.value })));
  }
  function deleteFootnotePopupNode() {
    // Retire le nœud footnoteRef lui-même, pas seulement son texte.
    const note = closeFootnotePopup();
    if (note) editor.view.dispatch(editor.state.tr.delete(note.pos, note.pos + note.node.nodeSize));
  }
  function openFootnoteEditorAt(pos) {
    const { box, textarea } = ensureFootnotePopup();
    if (footnotePopupPos != null && footnotePopupPos !== pos) commitFootnotePopup();
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'footnoteRef') {
      console.warn('[Editor] openFootnoteEditorAt(' + pos + ') : aucun nœud footnoteRef à cette position (trouvé : ' + (node && node.type && node.type.name) + ') - popup non ouverte.');
      return;
    }
    footnotePopupPos = pos;
    textarea.value = node.attrs.text || '';
    box.style.display = 'block';
    // Placé une fois affiché (sa taille réelle est mesurée), sous la note ou au-dessus s'il y a plus de place, et au-dessus de ce qui est déjà ouvert
    // (barre flottante du tableau ou de l'image) ; toute erreur de mesure retombe sur un positionnement générique plutôt que de bloquer l'ouverture.
    try {
      const dom = editor.view.nodeDOM(pos);
      const anchor = (dom && dom.getBoundingClientRect) ? dom : editor.view.dom;
      ViewportFit.placePopup(box, anchor.getBoundingClientRect(), { gap: 4 });
    } catch (e) {
      console.warn('[Editor] positionnement du popup de note échoué, repli générique :', e);
      box.style.position = 'fixed';
      box.style.left = '40%';
      box.style.top = '30%';
      Layers.raise(box);
    }
    // setTimeout(...,0), pas un appel synchrone : le mousedown déclencheur fait reprendre le focus sur .tiptap par ProseMirror juste après le retour
    // de cette fonction - un focus() synchrone ici serait écrasé.
    setTimeout(() => { textarea.focus(); }, 0);
  }

  async function pasteImageFile(file) {
    // Image collée depuis le presse-papiers, convertie en data URI (forme requise par pdf-export.js) avant insertion.
    let dataUri;
    try {
      dataUri = await ImageIo.toDataUri(file);
    } catch (e) {
      console.warn('[Editor] image collée illisible :', e);
      return;
    }
    await insertImageAtDefaultSize(dataUri);
  }

  function dispatchColumnWidthFix(currentEditor, tr, trigger) {
    // Applique une correction de largeurs de colonnes lancée depuis onUpdate : les fonctions ci-dessous mesurent le DOM, elles ne peuvent donc pas
    // passer par un appendTransaction. Rangée à part, la correction formerait son propre événement d'historique : Annuler ne défairait qu'elle,
    // qu'onUpdate rejouerait aussitôt (l'état rétabli redevient « à corriger »), et l'action d'origine (ajout d'une colonne, glissement d'une
    // bordure) ne pourrait plus jamais être annulée dans un tableau qui a des largeurs. `appendedTransaction` est le contrat que ProseMirror pose
    // lui-même sur les transactions d'un appendTransaction : prosemirror-history les range dans l'événement de la transaction racine, y compris
    // pendant un Annuler ou un Rétablir. Sans transaction d'origine (chargement d'un modèle, changement de marges), la correction ne vient pas d'un
    // geste de la personne : hors historique.
    if (trigger) tr.setMeta('appendedTransaction', trigger.getMeta('appendedTransaction') || trigger);
    else tr.setMeta('addToHistory', false);
    // Avec le suivi, ces largeurs ne sont pas une modification de la personne mais le widget qui remet le tableau d'aplomb : suivies, elles posaient
    // une marque « modification » sur chaque case, et sur la case d'une colonne ajoutée elles remplaçaient la marque « insertion » (la colonne ne
    // pouvait plus être refusée).
    TrackChanges.skipTracking(tr);
    currentEditor.view.dispatch(tr);
  }

  function fixColumnWidths(currentEditor, trigger, widthsFor) {
    // Pose sur les cases des tableaux du document les largeurs que choisit `widthsFor(table)` : pour un tableau, la fonction (case, position) ->
    // `colwidth` voulu (undefined : case laissée telle quelle), ou null pour ne pas toucher au tableau. Les tableaux imbriqués dans une case ne sont
    // pas parcourus.
    const { state } = currentEditor;
    let tr = null;
    state.doc.descendants((table, pos) => {
      if (table.type.name !== 'table') return true;
      const widthOf = table.firstChild && widthsFor(table);
      if (widthOf) {
        table.forEach((row, rowOffset) => row.forEach((cell, cellOffset) => {
          const cellPos = pos + 2 + rowOffset + cellOffset;
          const colwidth = widthOf(cell, cellPos);
          if (!colwidth) return;
          tr = tr || state.tr;
          tr.setNodeMarkup(cellPos, undefined, Object.assign({}, cell.attrs, { colwidth }));
        }));
      }
      return false;
    });
    if (tr) dispatchColumnWidthFix(currentEditor, tr, trigger);
  }

  const DEFAULT_COL_PX = 25;

  function backfillAutoColumnWidths(currentEditor, trigger) {
    // Tant qu'une colonne reste "auto" (sans `colwidth`), le tableau garde `width:100%` et une poignée de bord droit ne peut jamais l'agrandir ; on
    // gèle donc la largeur rendue de chaque colonne "auto" dès le premier redimensionnement, pour libérer le `width` exact du tableau.
    fixColumnWidths(currentEditor, trigger, table => {
      let hasExplicit = false; let hasAuto = false;
      table.firstChild.forEach(cell => { if (cell.attrs.colwidth) hasExplicit = true; else hasAuto = true; });
      if (!hasExplicit || !hasAuto) return null;
      // Une mesure est en pixels écran, un `colwidth` en pixels de mise en page : la feuille réduite (~0,85 dans un panneau de 700 px, EditorCore.layoutZoom)
      // sépare les deux. Gelée sur la mesure brute, une colonne perdait 15 % de sa largeur et le tableau rétrécissait d'autant dès la première largeur posée.
      const zoom = EditorCore.layoutZoom(currentEditor.view.dom);
      return (cell, cellPos) => {
        if (cell.attrs.colwidth) return undefined;
        const dom = currentEditor.view.nodeDOM(cellPos);
        if (!dom || !dom.getBoundingClientRect) return undefined;
        // Éditeur masqué (Lecture, macro-modèle) : la largeur mesurée vaut 0 et geler la colonne dessus la ramènerait au plancher de 25 px
        // ci-dessous. Rejoué quand l'éditeur redevient visible (refreshLayout).
        const renderedWidth = dom.getBoundingClientRect().width / zoom;
        if (!(renderedWidth > 0)) return undefined;
        const span = cell.attrs.colspan || 1;
        return Array(span).fill(Math.max(DEFAULT_COL_PX, Math.round(renderedWidth / span)));
      };
    });
  }

  function clampOverflowingTables(currentEditor, trigger) {
    // Un <col> à largeur explicite n'a pas de plafond naturel (contrairement à min-width) : rétrécit après coup les colonnes redimensionnées quand le
    // tableau dépasse la page en Aperçu A4 (léger rebond au relâcher, tolérable).
    const editorContainer = document.getElementById('editor-container');
    if (!editorContainer || !editorContainer.classList.contains('a4-preview')) return;
    const containerWidth = EditorCore.editorContentWidthPx(currentEditor);
    // 0 : éditeur masqué (Lecture, macro-modèle), rien à mesurer - les largeurs restent celles du modèle. Rejoué quand l'éditeur redevient visible
    // (refreshLayout). Calculé sur une largeur négative, le facteur ci-dessous ramenait toutes les colonnes à 25 px.
    if (!containerWidth) return;
    fixColumnWidths(currentEditor, trigger, table => {
      // Calculé sur la première ligne, mais appliqué à toutes : sinon prosemirror-tables (largeur cohérente par colonne exigée) annule la correction
      // pour la réaligner sur les lignes non corrigées.
      let total = 0;
      table.firstChild.forEach(cell => {
        const colwidth = cell.attrs.colwidth;
        total += colwidth ? colwidth.reduce((sum, w) => sum + (w || DEFAULT_COL_PX), 0) : DEFAULT_COL_PX * (cell.attrs.colspan || 1);
      });
      if (total <= containerWidth) return null;
      const scale = containerWidth / total;
      // Une colonne "auto" par défaut reste telle quelle.
      return cell => cell.attrs.colwidth && cell.attrs.colwidth.map(w => (w ? Math.max(DEFAULT_COL_PX, Math.round(w * scale)) : w));
    });
  }

  // Les classes de TipTap et de ProseMirror, chargées une seule fois : l'éditeur du document (init) et les champs texte à bulles (js/field-editor.js)
  // les prennent au même endroit.
  let librariesLoading = null;
  function loadLibraries() {
    if (!librariesLoading) librariesLoading = importLibraries();
    return librariesLoading;
  }
  async function importLibraries() {
    // TipTap et ProseMirror se chargent par import() : leurs classes n'existent pas avant. Aucune dépendance d'ordre entre ces modules (chacun
    // n'alimente que sa propre variable) : ils partent en parallèle plutôt qu'en `await` séquentiels, car un import() est une requête réseau vers
    // esm.sh et la cascade ajoutait jusqu'à 1 à 2 s au démarrage sur une connexion lente ou à cache froid.
    const [
      { Editor: TiptapEditor, Extension, Node, Mark, mergeAttributes, InputRule },
      { StarterKit },
      { TextAlign },
      { TextStyle },
      { FontFamily },
      { Suggestion },
      { Document },
      { Table, TableView },
      { TableRow },
      { TableCell },
      { TableHeader },
      { TaskList },
      { TaskItem },
      { Placeholder },
      { computePosition, offset, flip, shift, autoUpdate },
      { NodeSelection, TextSelection, EditorState, Plugin, PluginKey },
      { Decoration, DecorationSet },
      { TableMap, CellSelection, selectedRect, isInTable, addRow, addColumn, __pastedCells: pastedCells },
      { DOMParser: PMDOMParser },
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
      import('prosemirror-model'),
    ]);
    return {
      TiptapEditor, Extension, Node, Mark, mergeAttributes, InputRule, StarterKit, TextAlign, TextStyle, FontFamily, Suggestion, Document,
      Table, TableView, TableRow, TableCell, TableHeader, TaskList, TaskItem, Placeholder, computePosition, offset, flip, shift, autoUpdate,
      NodeSelection, TextSelection, EditorState, Plugin, PluginKey, Decoration, DecorationSet, TableMap, CellSelection, selectedRect, isInTable,
      addRow, addColumn, pastedCells, PMDOMParser,
    };
  }

  function configureModules({
    computePosition, offset, flip, shift, autoUpdate, NodeSelection, TextSelection, EditorState, Plugin, PluginKey, Decoration, DecorationSet,
    TableMap, CellSelection, selectedRect, isInTable, addRow, addColumn, pastedCells, PMDOMParser,
  }) {
    // Remet aux modules du widget les classes de TipTap et de ProseMirror dont ils ont besoin : bulles flottantes, sélections, tableaux, grille.
    EditorCore.setFloatingUi({ computePosition, offset, flip, shift, autoUpdate });
    GridEditor.configure({ Plugin, PluginKey, TextSelection, EditorState, Decoration, DecorationSet, TableMap, CellSelection, addRow, addColumn, pastedCells });
    LinkedTable.configure({ Plugin, PluginKey, TextSelection, Decoration, DecorationSet, PMDOMParser });
    tableTools = { selectedRect, isInTable };
    TableMerge.configure({ TableMap, selectedRect, isInTable });
    EditorCore.setNodeSelectionClass(NodeSelection);
    EditorCore.setTextSelectionClass(TextSelection);
  }

  // `doc` et tout conteneur de bloc dont un enfant direct peut être supprimé ou inséré en bloc autorisent les trois marques de suivi par
  // `.extend({marks: '...'})`, sans quoi ProseMirror lève « Invalid content for node X » à la première suppression de bloc entier sous suivi
  // (js/track-changes.js).
  function tracked(extension) { return TrackChanges.extendForTracking(extension); }

  function onEditorUpdate({ editor: updatedEditor, transaction }) {
    HeaderFooterPreview.enforceZoneHeightLimit(updatedEditor, transaction);
    backfillAutoColumnWidths(updatedEditor, transaction);
    clampOverflowingTables(updatedEditor, transaction);
    HeaderFooterPreview.schedulePaginationRecompute();
    refreshVariableBadgeValidity();
  }

  function clipboardProps() {
    return {
      // Copier une sélection de cases : le texte brut est un tableau tabulé (js/table-select.js), le HTML reste le tableau des cases ; tout le
      // reste garde le texte par défaut.
      clipboardTextSerializer: slice => TableSelect.clipboardText(slice),
      // Un tableau de tableur (Excel, Sheets, LibreOffice) collé dans un document devient un tableau du document, case par case
      // (js/grid-table.js) ; dans une grille, c'est le plugin de la grille (GridEditor.createExtension) qui le réécrit pour elle. Un exposant collé de
      // Google Docs perd d'abord la taille réduite de son <span> (js/script-marks.js : la marque réduit déjà le texte).
      transformPastedHTML: html => {
        const pasted = ScriptMarks.cleanPastedHtml(html);
        return GridEditor.isActive() ? pasted : GridTable.cleanPastedDocumentHtml(pasted);
      },
      // Ne consomme que si le presse-papiers contient réellement une image ; un collage de texte normal suit le traitement natif de ProseMirror.
      handlePaste(view, event) {
        // Un email est du texte brut : pas d'image, le collage suit alors le traitement natif (le texte du presse-papiers, s'il y en a un).
        if (EmailPlainText.isActive()) return false;
        const items = Array.from((event.clipboardData && event.clipboardData.items) || []);
        const imageItem = items.find(item => item.kind === 'file' && item.type && item.type.startsWith('image/'));
        if (!imageItem) return false;
        // Excel joint à son tableau HTML une image de la plage copiée : dans une grille comme dans un document, c'est le tableau, case par case,
        // que la personne veut.
        if (GridTable.clipboardHasSpreadsheetTable(event.clipboardData)) return false;
        const file = imageItem.getAsFile();
        if (!file) return false;
        event.preventDefault();
        pasteImageFile(file);
        return true;
      },
    };
  }

  function textExtensions({
    Extension, Node, Mark, mergeAttributes, StarterKit, Document, TextAlign, TextStyle, FontFamily, TaskList, TaskItem, Placeholder,
  }) {
    // Le texte et ses styles, les listes, les pastilles en ligne, les commentaires et le suivi des modifications.
    return [
      // Liens (js/link-dialog.js) : un clic place le curseur (Ctrl/⌘+clic ouvre le lien) ; une adresse tapée sans schéma prend https, plus http.
      // StarterKit embarque son propre `Document`, jamais extensible de l'extérieur : `document: false` le désactive pour lui substituer la version
      // étendue.
      StarterKit.configure({ document: false, link: { openOnClick: false, defaultProtocol: 'https' } }),
      tracked(Document),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      FontFamily,
      EditorNodes.createFontSizeExtension(Extension),
      EditorNodes.createTextColorExtension(Extension),
      EditorNodes.createHighlightExtension(Extension),
      // Exposant et indice (js/script-marks.js) : deux marques de caractère, qui s'excluent l'une l'autre.
      ...ScriptMarks.createMarks(Mark),
      EditorNodes.createBulletStyleExtension(Extension),
      EditorNodes.createOrderedListStyleExtension(Extension),
      TaskList,
      TaskItem.configure({ nested: false }),
      EditorNodes.createTaskListStyleExtension(Extension),
      // `includeChildren` n'est volontairement pas activé (défaut false) : un placeholder par cellule de tableau ou colonne vide encombrerait
      // l'écran de plusieurs textes gris, alors que seul le document principal, pris dans son ensemble, doit en montrer un. `placeholder` est une
      // fonction, pas une chaîne figée à la construction, pour deux raisons : (1) l'extension la relit à chaque recalcul de décoration (donc à
      // chaque frappe ou sélection), et un I18n.t() dedans suit un changement de langue en cours de session sans I18n.onChange ; (2) ce même
      // éditeur sert à éditer un en-tête ou un pied de page vide (contenu échangé par setContent, cf. header-footer-preview.js) : « Commencez à
      // écrire votre modèle ici… » y serait trompeur, donc rien n'y est affiché.
      Placeholder.configure({ placeholder: () => (HeaderFooterPreview.isEditingHeaderFooter() ? '' : I18n.t('editor.placeholder')) }),
      EditorNodes.createVarBadgeNode(Node, mergeAttributes),
      EditorNodes.createCalcBadgeNode(Node, mergeAttributes),
      EditorNodes.createCalcBadgeKeysExtension(Extension),
      EditorNodes.createPageNumberBadgeNode(Node, mergeAttributes),
      EditorNodes.createSmartChipNode(Node, mergeAttributes),
      EditorNodes.createFootnoteRefNode(Node, mergeAttributes),
      EditorNodes.createCommentMark(Mark, mergeAttributes),
      trackChangesApi.InsertionMark,
      trackChangesApi.DeletionMark,
      trackChangesApi.ModificationMark,
      trackChangesApi.SuggestChangesBridge,
    ];
  }

  function structureExtensions({
    Extension, Node, mergeAttributes, Plugin, PluginKey, Decoration, DecorationSet, EditorState, Suggestion, InputRule,
    Table, TableView, TableRow, TableHeader, TableCell,
  }) {
    // Les touches, les variables, les liens, la recherche, les tableaux, les colonnes, les blocs conditionnels, la légende, les images et les pages,
    // puis la grille.
    const withCellStyle = Cell => EditorNodes.withCellBackground(GridEditor.withCellAttributes(EditorNodes.withFastColwidth(Cell)));
    const { TwoColumnsColumn, TwoColumnsZone } = EditorNodes.createTwoColumnsNodes(Node, mergeAttributes);
    return [
      // Entrée d'une case de tableau, de grille ou de document (descend d'une case), rangée à cet endroit : après StarterKit et avant Variables et
      // TextExpansion. TipTap essaie la dernière extension rangée en premier : leurs listes ouvertes gardent donc Entrée, et la liste à puces aussi (cf.
      // GridEditor.createEnterExtension). Hors d'une case de tableau, elle ne fait rien.
      GridEditor.createEnterExtension(Extension),
      // Les touches d'une valeur conditionnelle (Entrée = retour à la ligne dans la valeur, Retour arrière la retire vide) : même rang que l'Entrée
      // d'une grille, pour la même raison.
      EditorNodes.createConditionalValueKeysExtension(Extension, Plugin, PluginKey),
      // Retour arrière et Suppr n'emportent plus une image en calque avec le texte voisin (la ligne qui la porte n'est qu'une ancre invisible) :
      // même rang, même raison ; un texte tapé, collé ou composé sur une sélection qui la contient la laisse aussi.
      EditorNodes.createFloatingImageKeysExtension(Extension, Plugin, PluginKey),
      // Un clic sur du texte posé sur une image « derrière le texte » atteint le texte, pas l'image (le cadre de l'image laisse passer les
      // clics quand le pointeur est sur un caractère).
      EditorNodes.createBehindImageClickThroughExtension(Extension, Plugin, PluginKey),
      Variables.createExtension(Extension, Suggestion),
      TextExpansion.createExtension(Extension, Suggestion, InputRule, PluginKey),
      LinkDialog.createExtension(Extension),
      // Rechercher / Remplacer (js/find-replace.js) : surlignage des résultats par décorations (Ctrl+F et Ctrl+H sont écoutés sur le document, cf.
      // wireEditor).
      FindReplace.createExtension(Extension, { Plugin, PluginKey, Decoration, DecorationSet }),
      // Le tableau porte les attributs de la grille (quadrillage) et le numéro du modèle Grille dont il est la copie (js/linked-table.js).
      tracked(LinkedTable.withAttributes(GridEditor.withTableAttributes(Table))).configure({ resizable: true, View: EditorNodes.createTableView(TableView) }),
      // La ligne aussi : « Colonne avant / après » et « Supprimer la colonne » posent une marque sur chaque case de la colonne, des enfants directs
      // d'une ligne.
      tracked(GridEditor.withRowAttributes(TableRow)),
      tracked(withCellStyle(TableHeader)),
      tracked(withCellStyle(TableCell)),
      tracked(TwoColumnsColumn),
      tracked(TwoColumnsZone),
      // Encadré (js/callout.js) : un bloc qui contient des blocs, comme une colonne - il doit donc, lui aussi, accepter les marques de suivi sur
      // ses enfants.
      tracked(Callout.createNode(Node, mergeAttributes)),
      tracked(EditorNodes.createConditionalTextNode(Node, mergeAttributes)),
      EditorNodes.createConditionalCheckboxNode(Node, mergeAttributes),
      EditorNodes.createConditionalValueNode(Node, mergeAttributes),
      // Légende (js/caption.js) : un attribut du paragraphe, plus le texte d'attente de la légende vide où se trouve le curseur.
      Caption.createExtension(Extension, { Plugin, PluginKey, Decoration, DecorationSet }),
      // « Garder avec le suivant » (js/keep-with-next.js) : un attribut du paragraphe, sans plugin.
      KeepWithNext.createExtension(Extension),
      EditorNodes.createEditorImageNode(Node),
      EditorNodes.createPageBreakNode(Node),
      EditorNodes.createHeadingNumberingConfigNode(Node),
      EditorNodes.createTocNode(Node),
      EditorNodes.createTabNavigationExtension(Extension),
      EditorNodes.createClearHistoryExtension(Extension, EditorState),
      // Modèle email (js/email-plain-text.js) : ni raccourci de mise en forme, ni mise en forme collée, que le texte brut du lien ne porte pas.
      EmailPlainText.createExtension(Extension, { Plugin, PluginKey }),
      // Tableau lié à un modèle Grille : ses cases suivent les règles d'une grille, un modèle n'y est lié qu'une fois par document, un repère le montre.
      LinkedTable.createExtension(Extension),
      GridEditor.createExtension(Extension),
    ];
  }

  async function init() {
    const libs = await loadLibraries();
    configureModules(libs);
    // Les marques de suivi et le pont ProseMirror se construisent une fois, avant les extensions qui s'en servent.
    trackChangesApi = await TrackChanges.createExtensions(libs.Node, libs.Mark, libs.Extension, libs.mergeAttributes);
    // Une modification neuve ne reprend jamais le numéro d'une modification que la session connaît, résolue ou non
    // (js/track-changes.js:nextSuggestionId).
    TrackChanges.setKnownSuggestionIds(() => Object.keys(suiviMetadataCache));
    editor = new libs.TiptapEditor({
      element: document.getElementById('editor-container'),
      onUpdate: onEditorUpdate,
      editorProps: clipboardProps(),
      // L'ordre compte : TipTap essaie la dernière extension rangée en premier (cf. GridEditor.createEnterExtension).
      extensions: [...textExtensions(libs), ...structureExtensions(libs)],
      content: '',
    });
    wireEditor();
    return editor;
  }

  function wireEditor() {
    // Branche l'éditeur construit sur les modules qui le pilotent (barres d'outils, boîtes, pagination).
    EditorCore.setEditor(editor);
    trackChangesApi.installSerializer(editor.schema);
    HeaderFooterPreview.setEditor(editor);

    // Enveloppe posée une seule fois, jamais recréée ensuite (renderPaginationOverlay relit juste tiptapEl.parentElement) : porte le fond/liseré
    // "page" en Aperçu A4 pour que les zones d'en-tête/pied restent visuellement collées au corps.
    const pageSheet = el('div', 'v2-page-sheet');
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
    FloatingToolbars.wireSuggestionFloatingToolbar({ of: getSuggestionAuthors, onChange: onSuggestionAuthorsChange });
    Comments.setEditor(editor);
    Comments.wireClickToOpen();
    editor.on('selectionUpdate', MainToolbar.syncToolbarState);
    editor.on('transaction', MainToolbar.syncToolbarState);
    // Le placeholder (plus haut) relit I18n.t() à chaque recalcul de décoration, mais ProseMirror pilote ce recalcul (sur chaque transaction), jamais
    // I18n : changer de langue pendant que l'éditeur est vide ne redessine donc rien tout seul, aucune transaction n'ayant eu lieu. Une transaction
    // vide (même idiome que setHTML plus bas) force ce recalcul sans toucher au document.
    I18n.onChange(() => { if (editor) editor.view.dispatch(editor.state.tr); });
    window.addEventListener('resize', HeaderFooterPreview.schedulePaginationRecompute);
  }

  // Une grille s'enregistre et s'exporte sans le paragraphe vide caché sous son tableau (GridEditor.serialize).
  function getHTML() { return editor ? GridEditor.serialize(editor.getHTML()) : ''; }

  function getHeadingNumberingStyle() {
    if (!editor) return 'none';
    let style = 'none';
    editor.state.doc.forEach(node => { if (node.type.name === 'headingNumberingConfig') style = node.attrs.numberingStyle; });
    return style;
  }

  function badgeProblemText(table, column) {
    // Message en info-bulle d'une bulle #Variable dont la table, la colonne ou un maillon du chemin n'existe plus ; '' quand tout va bien.
    switch (Variables.badgeProblem(table, column)) {
      case 'table': return I18n.t('varBadge.brokenTable', { table });
      // Bulle qui descend de référence en référence (« Accompagnateur.Email ») : chaque maillon doit exister et, sauf le dernier, être une Référence.
      case 'path': return I18n.t('varBadge.brokenPath', { column, table });
      case 'column': return I18n.t('varBadge.brokenColumn', { column, table });
      default: return '';
    }
  }

  // Signale, dans `root` (le DOM d'un éditeur), les bulles #Variable dont la table ou la colonne n'existe plus : une classe et un title sur le <span>
  // rendu, jamais un attribut du nœud (cela dépend d'un état externe, pas du contenu). Une bulle « Calcul » est cassée quand sa formule ne se lit plus
  // ou cite une colonne qui n'existe plus (Variables.calcProblem), avec le message en info-bulle. Le sinon d'une bulle (js/variable-otherwise.js) qui
  // n'existe plus rougit sa seule pastille (`var-badge-otherwise-broken`), la bulle gardant son aspect : sa condition peut très bien être remplie.
  function markBadgeValidity(root) {
    const mark = (badge, brokenClass, reason) => {
      badge.classList.toggle(brokenClass, !!reason);
      if (reason) badge.title = reason; else badge.removeAttribute('title');
    };
    root.querySelectorAll('span.var-badge').forEach(badge => {
      const problem = badgeProblemText(badge.dataset.table, badge.dataset.column);
      const otherwise = badge.dataset.otherwiseKey ? badgeProblemText(badge.dataset.otherwiseTable, badge.dataset.otherwiseColumn) : '';
      badge.classList.toggle('var-badge-otherwise-broken', !!otherwise);
      mark(badge, 'var-badge-broken', problem);
      if (!problem && otherwise) badge.title = I18n.t('varBadge.brokenOtherwise', { problem: otherwise });
    });
    root.querySelectorAll('span.calc-badge').forEach(badge => mark(badge, 'calc-badge-broken', Variables.calcProblem(badge.getAttribute('data-formula') || '')));
  }
  function refreshVariableBadgeValidity() {
    // ProseMirror peut reconstruire le <span> d'une bulle à tout moment : le signalement est rejoué à chaque déclencheur pertinent plutôt que posé une
    // fois. Les champs texte à bulles (Objet, À, Cc, Cci, nom du PDF) y passent aussi.
    if (!editor) return;
    markBadgeValidity(editor.view.dom);
    FieldEditor.refreshBadgeValidity();
  }

  // Âge au-delà duquel l'affichage d'un modèle relit le schéma exact même sans bulle rouge (setHTML) ; le même qu'au démarrage (js/main.js).
  const SCHEMA_MAX_AGE_MS = 60000;

  function setHTML(html, suiviModifications) {
    // `suiviModifications` : métadonnée { [id]: {author, createdAt} } relue depuis la colonne Grist du modèle (null pour un modèle jamais suivi, ou
    // de type macro, cf. js/templates.js). Le chargement passe par `loadTrackedDocument` (js/track-changes.js), pas par `setContent` : le suivi peut
    // être actif à ce moment (rien ne l'aurait désactivé entre deux modèles), et le pont TipTap interpréterait un `setContent` comme une suggestion
    // géante, qui doublerait tout le contenu au lieu de le remplacer (planning/feature-track-changes.md).
    if (!editor) return;
    suiviMetadataCache = suiviModifications || {};
    const wasTrackChangesOn = isTrackChangesOn();
    editor.commands.loadTrackedDocument(html || '');
    // Sans cela, l'historique Annuler/Rétablir s'accumulerait à travers les changements de modèle : un Annuler après chargement pouvait faire
    // réapparaître le contenu d'un modèle précédent.
    editor.commands.clearHistory();
    // Les modifications en attente que le document n'a jamais attribuées n'ont pas d'auteur : elles ne sont mises au nom de personne, ni à l'écran ni
    // à l'enregistrement.
    suiviMetadataCache = TrackChanges.seedMetadata(editor.state, suiviMetadataCache);
    // clearHistory() reconstruit l'état ProseMirror par EditorState.create(), qui réinitialise l'état de tous les plugins (pas seulement l'historique
    // qu'elle vise) : le mode suivi (un booléen de plugin, jamais stocké dans le document) repasserait sinon silencieusement à « désactivé » à chaque
    // changement de modèle, y compris en rechargeant le même. Cf. TrackChanges.restoreSuggestModeIfNeeded (js/track-changes.js).
    trackChangesApi.restoreSuggestModeIfNeeded(editor, wasTrackChangesOn);
    editor.view.dom.dataset.headingStyle = getHeadingNumberingStyle();
    // Force un rafraîchissement du NodeView du sommaire : son premier rendu (pendant setContent) a eu lieu avant que headingStyle soit posé
    // ci-dessus.
    editor.view.dispatch(editor.state.tr);
    // Le dispatch ci-dessus ne déclenche pas onUpdate (pas de changement réel) : clampOverflowingTables ne tournerait donc pas seule pour un tableau
    // déjà trop large à l'import, d'où l'appel explicite.
    backfillAutoColumnWidths(editor);
    clampOverflowingTables(editor);
    HeaderFooterPreview.renderPaginationOverlay();
    const imagesRegridded = HeaderFooterPreview.migrateLegacyImagePositions();
    HeaderFooterPreview.reconcileLayerImagesWithGrid({ layoutFresh: !imagesRegridded });
    // Vérification immédiate (schéma en cache) puis après rafraîchissement explicite (couvre une table/colonne supprimée entretemps). La passe
    // exacte lit toutes les tables en entier (1,4 M de cases à chaque modèle affiché dans un document de 40 tables de 2 000 lignes) : quand aucune
    // bulle n'est rouge, celle d'il y a moins d'une minute suffit (js/main.js la demande de même à l'ouverture) ; une bulle rouge peut venir d'un
    // schéma périmé (une colonne ajoutée depuis), la passe repart alors comme avant.
    refreshVariableBadgeValidity();
    const looksBroken = !!editor.view.dom.querySelector('.var-badge-broken, .calc-badge-broken');
    GristAPI.refreshSchema(looksBroken ? undefined : { maxAgeMs: SCHEMA_MAX_AGE_MS }).then(refreshVariableBadgeValidity)
      .catch(e => console.warn('[Editor] refreshSchema pour la validation des #Variable a échoué', e));
  }

  function refreshLayout() {
    // Appelé après un changement de marges de page (js/page-layout.js) et chaque fois que l'éditeur redevient visible
    // (js/main.js:syncEditorVisibilityForMode). Les zones à deux colonnes n'ont rien à recalculer ici : `--layout-left` porte une longueur en mm (cf.
    // js/editor-nodes.js), que le moteur CSS réévalue seul quand le padding de `.tiptap` change. Reste ce que CSS ne sait pas faire : la pagination
    // affichée dépend de la hauteur de contenu d'une page, donc des marges haut et bas, et sans ce recalcul les bandes de couture restaient figées
    // sur la géométrie des marges précédentes. Un modèle chargé pendant que l'éditeur était masqué (Lecture, macro-modèle) n'a pu ni geler ses
    // colonnes automatiques ni ramener un tableau trop large dans la page : ces deux mesures exigent une mise en page réelle.
    if (!editor) return;
    backfillAutoColumnWidths(editor);
    clampOverflowingTables(editor);
    // Les images en calque d'un ancien modèle chargé masqué n'ont pas pu recevoir leur position de page (cf.
    // HeaderFooterPreview.migrateLegacyImagePositions) : mesurées ici, une fois les largeurs de colonnes réglées, avec la mise en page que l'éditeur
    // vient de retrouver.
    HeaderFooterPreview.migrateLegacyImagePositions();
    HeaderFooterPreview.reconcileLayerImagesWithGrid({ onlyIfPending: true });
    HeaderFooterPreview.schedulePaginationRecompute();
    GridEditor.refresh();
  }

  function isTrackChangesOn() {
    return !!editor && !!trackChangesApi && trackChangesApi.isSuggestModeOn(editor.state);
  }

  function setTrackChanges(on) {
    // Allume ou éteint le suivi sans passer par le bouton de la barre : une grille l'éteint à l'ouverture (js/grid-editor.js:setActive).
    if (!editor || !trackChangesApi || isTrackChangesOn() === !!on) return;
    trackChangesApi.toggleSuggestMode(editor);
  }

  function selectedColumnsCrossMergedCell() {
    // La ou les colonnes de la sélection sont-elles traversées par une case fusionnée en largeur ? Les supprimer revient à réduire la largeur de
    // cette case et à retirer les autres cases de la colonne ; avec le suivi, le premier changement s'applique tout de suite et le second seulement à
    // l'acceptation. Entre les deux, le tableau n'est plus rectangulaire et prosemirror-tables le « répare » en ajoutant des cases vides : le tableau
    // accepté (ou refusé) n'a plus la forme voulue. La barre du tableau grise donc « Supprimer la colonne » dans ce cas (js/floating-toolbars.js).
    // Ajouter une colonne à travers une case fusionnée se résout proprement.
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

  function selectedRowsCrossMergedCell() {
    // Même question pour la ou les lignes de la sélection, traversées par une case fusionnée en hauteur (rowspan). Supprimer une ligne réduit la
    // hauteur de cette case et retire les autres cases de la ligne ; avec le suivi, le premier changement s'applique tout de suite et le second
    // seulement à l'acceptation. Mesuré : « Tout refuser » rendait un tableau d'une colonne de trop (prosemirror-tables « répare » le tableau devenu
    // non rectangulaire en ajoutant des cases vides), « Tout accepter » des cases décalées. La barre du tableau grise donc « Supprimer la ligne »
    // dans ce cas (js/floating-toolbars.js). Ajouter une ligne à travers une case fusionnée se résout proprement.
    if (!editor || !tableTools || !tableTools.isInTable(editor.state)) return false;
    const { map, top, bottom } = tableTools.selectedRect(editor.state);
    for (let col = 0; col < map.width; col++) {
      for (let row = top; row < bottom; row++) {
        const cell = map.findCell(map.map[row * map.width + col]);
        if (cell.top < top || cell.bottom > bottom) return true;
      }
    }
    return false;
  }

  function hasPendingTrackedChanges() {
    return !!editor && TrackChanges.hasPendingSuggestions(editor.state);
  }

  function readCurrentAuthor() {
    // Qui est devant l'écran, lu une fois (les demandes qui se chevauchent n'en font qu'une). Le nom d'abord demandé ajoute une colonne à la table
    // interne de l'identification (js/grist-api.js) : une personne sans droit sur la structure du document ne l'obtient pas, son adresse suffit
    // alors. Repli anonyme silencieux (null) si l'identification échoue, même convention que js/comments.js.
    if (currentAuthor) return Promise.resolve(currentAuthor);
    if (!currentAuthorRead) {
      currentAuthorRead = (async () => {
        let email = '';
        try { email = await GristAPI.getCurrentUserEmail(); } catch (e) { /* repli anonyme silencieux */ }
        if (!email) { currentAuthorFailedAt = Date.now(); return null; }
        let name = '';
        try { name = await GristAPI.getCurrentUserName(); } catch (e) { /* l'adresse suffit */ }
        currentAuthor = { email, name: name || '' };
        authorListeners.forEach((fn) => { try { fn(); } catch (e) { console.warn('[Editor] écouteur des auteurs en échec', e); } });
        return currentAuthor;
      })();
      const done = () => { currentAuthorRead = null; };
      currentAuthorRead.then(done, done);
    }
    return currentAuthorRead;
  }

  function getSuggestionAuthors(ids) {
    // Les personnes derrière les modifications d'ids donnés : [{ name, email }] (js/track-changes.js:authorsOfSuggestions), pour la barre « Accepter
    // / Refuser ». Une modification que les métadonnées ne connaissent pas est celle de la personne devant l'écran : tant qu'on ne l'a pas lue, la
    // liste ne la compte pas, et sa lecture part (la barre est prévenue par onSuggestionAuthorsChange quand elle arrive).
    const fresh = ids.some(id => !suiviMetadataCache[String(id)]);
    if (fresh && !currentAuthor && !currentAuthorRead && Date.now() - currentAuthorFailedAt > AUTHOR_RETRY_MS) readCurrentAuthor();
    return TrackChanges.authorsOfSuggestions(ids, suiviMetadataCache, currentAuthor);
  }
  function onSuggestionAuthorsChange(fn) {
    if (typeof fn === 'function') authorListeners.push(fn);
  }

  async function getSuiviModificationsForSave() {
    // Auteur et horodatage par suggestion en attente (colonne Grist SuiviModifications, cf. suiviMetadataCache plus haut). Appelée juste avant chaque
    // Templates.save() (enregistrement manuel et automatique, js/main.js), jamais séparément : cette colonne ne s'écrit jamais hors du même
    // UpdateRecord que Contenu et DateModif (planning/feature-track-changes.md, fenêtre de risque en cas de conflit). Le nom de la personne devant
    // l'écran ne se lit que quand une modification neuve attend son auteur (il ajoute une colonne à la table d'identification). Le JSON rendu ne
    // garde que les modifications en attente ; la session garde tout ce qu'elle a vu, y compris ce qui est résolu depuis : « Annuler » le ramène avec
    // son auteur.
    if (!editor) return suiviMetadataCache;
    const fresh = Array.from(TrackChanges.collectPendingIds(editor.state)).some(id => !suiviMetadataCache[id]);
    let author = null;
    if (fresh) {
      author = await readCurrentAuthor();
    } else {
      // Aucune modification neuve : l'adresse ne sert à rien ici, mais elle se lit à chaque enregistrement comme avant. GristAPI la garde une fois
      // lue (un seul passage par la table d'identification) et d'autres modules s'appuient sur ce premier passage ; sans lui il viendrait pendant la
      // frappe suivante, au milieu d'un enregistrement automatique (dev-tests/scenarios-autosave-race.js : jamais deux écritures à la fois).
      try { await GristAPI.getCurrentUserEmail(); } catch (e) { /* repli anonyme silencieux */ }
    }
    const saved = TrackChanges.computeMetadata(editor.state, suiviMetadataCache, author);
    suiviMetadataCache = Object.assign({}, suiviMetadataCache, saved);
    return saved;
  }

  return {
    init, loadLibraries, markBadgeValidity, badgeProblemText, getHTML, setHTML, getHeadingNumberingStyle, insertImageAtDefaultSize,
    getHeaderFooterData: HeaderFooterPreview.getHeaderFooterData, setHeaderFooterData: HeaderFooterPreview.setHeaderFooterData,
    exitHeaderFooterModeIfActive: HeaderFooterPreview.exitHeaderFooterModeIfActive,
    // Aperçu A4 rallumé, facteur d'ajustement changé... : la pagination est refaite, et la position des images d'un modèle chargé sans mise en page
    // se relit sur leur grille.
    refreshPaginationPreview: () => { HeaderFooterPreview.renderPaginationOverlay(); HeaderFooterPreview.reconcileLayerImagesWithGrid({ onlyIfPending: true }); },
    refreshLayout, openFootnoteEditorAt, isEditingHeaderFooter: HeaderFooterPreview.isEditingHeaderFooter, isTrackChangesOn, setTrackChanges,
    hasPendingTrackedChanges, selectedColumnsCrossMergedCell, selectedRowsCrossMergedCell, getSuiviModificationsForSave, getSuggestionAuthors,
    onSuggestionAuthorsChange,
  };
})();
