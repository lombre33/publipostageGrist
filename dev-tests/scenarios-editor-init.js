// Suite "editorInit" - ce que `Editor.init` assemble (js/editor.js) : les extensions TipTap dans l'ordre où l'éditeur les range, les nœuds et les
// marques du schéma, les plugins nommés, et les gestes de l'éditeur (mise à jour, presse-papiers). TipTap essaie la dernière extension rangée en
// premier : déplacer une entrée de la liste change l'extension qui reçoit Entrée, Retour arrière ou Suppr, sans qu'aucune autre suite ne le voie.
(function () {
  const cases = [];
  const words = text => text.split(/\s+/).filter(Boolean);
  const editor = () => EditorCore.getEditor();

  // Type (m = marque, n = nœud, e = extension) et nom, dans l'ordre que TipTap leur donne (priorité, puis rang). Une liste ouverte doit voir ↑, ↓ et Tab avant
  // prosemirror-tables : varBadgeSuggestion (« # »), textExpansion (« § »), mentionSuggestion (« @ »), emailPlainText (js/email-plain-text.js) et gridEditor sont de priorité 1000 (« # » dans une case : verify-grid-hash-mouse.mjs).
  const EXTENSIONS = words(`
    m:link n:paragraph e:calcBadgeKeys e:varBadgeSuggestion e:textExpansion e:mentionSuggestion e:emailPlainText e:gridEditor m:insertion m:deletion e:listItemBranchingDeleteKeymap m:textStyle e:editable
    e:clipboardTextSerializer e:commands e:focusEvents e:keymap e:tabindex e:drop e:paste e:delete e:textDirection e:starterKit m:bold n:blockquote
    n:bulletList m:code n:codeBlock e:dropCursor e:gapCursor n:hardBreak n:heading e:undoRedo n:horizontalRule m:italic n:listItem e:listKeymap
    n:orderedList m:strike n:text m:underline e:trailingNode n:doc e:textAlign e:fontFamily e:fontSize e:textColor e:highlightColor m:superscript m:subscript
    e:bulletStyle e:orderedListStyle n:taskList n:taskItem e:taskListStyle e:placeholder n:varBadge n:calcBadge n:pageNumberBadge n:smartChip n:tabStop n:mention n:footnoteRef e:inlineMarksCarrier
    m:commentMark m:modification e:suggestChangesBridge e:gridEnter e:conditionalValueKeys e:floatingImageKeys e:behindImageClickThrough
    e:linkShortcut e:findReplace n:table n:tableRow n:tableHeader n:tableCell n:twoColumnsColumn n:twoColumnsZone n:callout
    n:conditionalText n:conditionalCheckbox n:conditionalValue e:caption e:keepNext e:typingStyle e:anchors n:editorImage n:pageBreak e:pageSections n:headingNumberingConfig n:toc
    n:slideLink e:slideLinks e:slideCopies e:slideText n:freeFrame n:freeLine e:freeFrameBehaviour n:slideProps e:slidePropsGuard e:tabNavigation e:clearHistory e:linkedTable e:tabIndent
  `);
  const NODES = words(`
    paragraph blockquote bulletList codeBlock hardBreak heading horizontalRule listItem orderedList text doc taskList taskItem varBadge
    calcBadge pageNumberBadge smartChip tabStop mention footnoteRef table tableRow tableHeader tableCell twoColumnsColumn twoColumnsZone callout
    conditionalText conditionalCheckbox conditionalValue editorImage pageBreak headingNumberingConfig toc slideLink freeFrame freeLine slideProps
  `);
  const MARKS = words('link insertion deletion textStyle bold code italic strike underline superscript subscript commentMark modification');
  // Les plugins qui portent un nom, dans l'ordre de l'état de l'éditeur (les autres s'appellent `plugin$`, `plugin$1`...).
  const NAMED_PLUGINS = words(`
    gridEditor$ emailPlainText$ mentionSuggestion$ textExpansionSuggestion$ suggestion$ autolink$ handleClickLink$ handlePasteLink$ linkedTable$ slideProps$ freeFrame$ slideText$ slideCopies$ slideLinks$ pageSections$ anchors$ typingStyle$ captionPlaceholder$ tableColumnResizing$ selectingCells$
    ppFindReplace$ behindImageClickThrough$ floatingImageKeep$ conditionalValueInput$ @handlewithcare/prosemirror-suggest-changes$
    tiptap__placeholder$ trailingNode$ history$ codeBlockVSCodeHandler$ textDirection$ tiptapPaste$ tiptapDrop$ tabindex$ clearDocument$ focusEvents$
    clipboardTextSerializer$ editable$ tabIndent$
  `);
  const PLUGIN_COUNT = 165; // dont deux d'emailPlainText (js/email-plain-text.js), un plugin de clavier par marque d'exposant et d'indice (js/script-marks.js),
  // deux du tableau lié (js/linked-table.js : le clavier que TipTap pose pour toute extension, et `linkedTable$`, le garde-fou et le repère), trois des diapositives liées
  // (js/slide-links.js : le clavier de son nœud, celui de son extension et `slideLinks$`, le garde-fou et le repère), deux des copies de diapositive qui suivent leur source dans un document (js/slide-copies.js : le clavier de son extension
  // et `slideCopies$`, le verrou et le trait d'accent), deux du texte des diapositives (js/slides-entry.js : le clavier de son extension
  // et `slideText$`, qui pose les tailles du texte neuf), quatre des cadres de texte libres et des lignes (js/free-frame.js : le clavier du nœud du cadre, celui du nœud de la ligne, celui de l'extension et `freeFrame$` : le contour du cadre
  // actif, le collage, les touches et le rangement), trois du repère de transition d'une diapositive (js/slide-props.js : le clavier de son nœud, celui de son extension et `slideProps$` : le
  // rangement, Retour arrière et le collage), un du porteur des marques des nœuds en ligne
  // (js/editor-nodes.js : `inlineMarksCarrier`, qui n'a que ce clavier), deux des signets (js/anchors.js : ce clavier et `anchors$`, les drapeaux et la correction des doublons),
  // deux de la vue des pages de sens différents (js/page-section-view.js : le clavier de son extension et `pageSections$`, qui pose les décorations des pages étroites et la classe de la feuille),
  // deux du style de frappe des cases vides (js/typing-style.js : le clavier de son extension et `typingStyle$`, qui rend les marques en attente au curseur et la frappe sur des cases sélectionnées),
  // trois de la pastille « @ » (js/mention.js : le clavier de son nœud, celui de son extension et `mentionSuggestion$`) et trois de la tabulation (js/tab-indent.js : le clavier de son
  // nœud, celui de son extension et `tabIndent$`, qui change en nœud les tabulations brutes ; l'extension est de priorité 1, rangée en dernier : ses touches passent après toutes les autres) ;
  // les plugins vont dans l'ordre inverse des extensions
  // (la dernière rangée, `mentionSuggestion$`, reçoit les touches avant `textExpansionSuggestion$` puis `suggestion$`, la liste « # »)

  // Premier écart entre deux listes, pour un message qui dit où chercher.
  function firstDifference(actual, expected) {
    const length = Math.max(actual.length, expected.length);
    for (let i = 0; i < length; i++) if (actual[i] !== expected[i]) return `rang ${i} : ${actual[i]} au lieu de ${expected[i]}`;
    return '';
  }

  cases.push({
    id: 'editor_init_extensions_keep_their_order',
    description: 'les extensions de l\'éditeur sont rangées dans le même ordre : une entrée déplacée change celle qui reçoit Entrée, Retour arrière ou Suppr',
    run: () => {
      const actual = editor().extensionManager.extensions.map(extension => extension.type[0] + ':' + extension.name);
      const diff = firstDifference(actual, EXTENSIONS);
      return { pass: !diff, notes: diff || actual.length + ' extensions' };
    },
  });

  cases.push({
    id: 'editor_init_schema_and_plugins_follow_the_extensions',
    description: 'le schéma (nœuds, marques) et les plugins nommés de l\'état suivent l\'ordre des extensions',
    run: () => {
      const ed = editor();
      const named = ed.state.plugins.map(plugin => plugin.key).filter(key => !/^plugin\$\d*$/.test(key));
      const diffs = [
        firstDifference(Object.keys(ed.schema.nodes), NODES) && 'nœuds ' + firstDifference(Object.keys(ed.schema.nodes), NODES),
        firstDifference(Object.keys(ed.schema.marks), MARKS) && 'marques ' + firstDifference(Object.keys(ed.schema.marks), MARKS),
        firstDifference(named, NAMED_PLUGINS) && 'plugins ' + firstDifference(named, NAMED_PLUGINS),
        ed.state.plugins.length !== PLUGIN_COUNT && `${ed.state.plugins.length} plugins au lieu de ${PLUGIN_COUNT}`,
      ].filter(Boolean);
      return { pass: diffs.length === 0, notes: diffs.join(' ; ') || 'schéma et plugins conformes' };
    },
  });

  cases.push({
    id: 'editor_init_update_refreshes_the_page_view',
    description: 'une modification du texte recalcule la pagination et ce que la zone d\'en-tête ou de pied ouverte a de trop (trait et note de dépassement), puis les largeurs de colonnes (onUpdate)',
    run: () => {
      const calls = { pagination: 0, zones: 0 };
      const { schedulePaginationRecompute, scheduleZoneCheck } = HeaderFooterPreview;
      HeaderFooterPreview.schedulePaginationRecompute = () => { calls.pagination++; };
      HeaderFooterPreview.scheduleZoneCheck = () => { calls.zones++; };
      try {
        editor().commands.setContent('<p>Bonjour</p>');
        calls.pagination = 0;
        calls.zones = 0;
        editor().commands.insertContent('!');
      } finally {
        HeaderFooterPreview.schedulePaginationRecompute = schedulePaginationRecompute;
        HeaderFooterPreview.scheduleZoneCheck = scheduleZoneCheck;
      }
      return { pass: calls.pagination >= 1 && calls.zones >= 1, notes: JSON.stringify(calls) };
    },
  });

  cases.push({
    id: 'editor_init_clipboard_props',
    description: 'le presse-papiers : texte copié d\'une sélection, tableau de tableur nettoyé et préféré à son image, collage de texte laissé à ProseMirror',
    run: () => {
      const ed = editor();
      const props = ed.options.editorProps;
      ed.commands.setContent('<p>Bonjour le monde</p>');
      const slice = ed.state.doc.slice(1, 8);
      const sheetHtml = '<meta name="generator" content="Sheets"><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
      const prevented = [];
      const clipboard = (items, getData) => ({ clipboardData: { items, getData: getData || (() => '') }, preventDefault: () => prevented.push(true) });
      const textOnly = props.handlePaste(null, clipboard([{ kind: 'string', type: 'text/plain' }]));
      const imageWithoutFile = props.handlePaste(null, clipboard([{ kind: 'file', type: 'image/png', getAsFile: () => null }]));
      const sheetWithImage = props.handlePaste(null, clipboard([{ kind: 'file', type: 'image/png', getAsFile: () => new Blob(['x'], { type: 'image/png' }) }],
        type => (type === 'text/html' ? sheetHtml : '')));
      const cleaned = props.transformPastedHTML(sheetHtml);
      const checks = {
        keys: Object.keys(props).sort().join(',') === 'clipboardTextSerializer,handlePaste,transformPastedHTML',
        serializer: props.clipboardTextSerializer(slice) === TableSelect.clipboardText(slice),
        cleaned: cleaned !== sheetHtml && cleaned === GridTable.cleanPastedDocumentHtml(sheetHtml) && props.transformPastedHTML('<p>texte</p>') === '<p>texte</p>',
        textOnly: textOnly === false,
        imageWithoutFile: imageWithoutFile === false,
        sheetBeatsImage: sheetWithImage === false,
        nothingPrevented: prevented.length === 0,
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.editorInit = cases;
})();
