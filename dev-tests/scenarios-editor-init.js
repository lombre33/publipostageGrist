// Suite "editorInit" - ce que `Editor.init` assemble (js/editor.js) : les extensions TipTap dans l'ordre où l'éditeur les range, les nœuds et les
// marques du schéma, les plugins nommés, et les gestes de l'éditeur (mise à jour, presse-papiers). TipTap essaie la dernière extension rangée en
// premier : déplacer une entrée de la liste change l'extension qui reçoit Entrée, Retour arrière ou Suppr, sans qu'aucune autre suite ne le voie.
(function () {
  const cases = [];
  const words = text => text.split(/\s+/).filter(Boolean);
  const editor = () => EditorCore.getEditor();

  // Type (m = marque, n = nœud, e = extension) et nom, dans l'ordre que TipTap leur donne (priorité, puis rang). Une liste ouverte doit voir ↑, ↓ et Tab avant
  // prosemirror-tables : varBadgeSuggestion (« # »), textExpansion (« § »), emailPlainText (js/email-plain-text.js) et gridEditor sont de priorité 1000 (« # » dans une case : verify-grid-hash-mouse.mjs).
  const EXTENSIONS = words(`
    m:link n:paragraph e:calcBadgeKeys e:varBadgeSuggestion e:textExpansion e:emailPlainText e:gridEditor m:insertion m:deletion e:listItemBranchingDeleteKeymap m:textStyle e:editable
    e:clipboardTextSerializer e:commands e:focusEvents e:keymap e:tabindex e:drop e:paste e:delete e:textDirection e:starterKit m:bold n:blockquote
    n:bulletList m:code n:codeBlock e:dropCursor e:gapCursor n:hardBreak n:heading e:undoRedo n:horizontalRule m:italic n:listItem e:listKeymap
    n:orderedList m:strike n:text m:underline e:trailingNode n:doc e:textAlign e:fontFamily e:fontSize e:textColor e:highlightColor m:superscript m:subscript
    e:bulletStyle e:orderedListStyle n:taskList n:taskItem e:taskListStyle e:placeholder n:varBadge n:calcBadge n:pageNumberBadge n:smartChip n:footnoteRef
    m:commentMark m:modification e:suggestChangesBridge e:gridEnter e:conditionalValueKeys e:floatingImageKeys e:behindImageClickThrough
    e:linkShortcut e:findReplace n:table n:tableRow n:tableHeader n:tableCell n:twoColumnsColumn n:twoColumnsZone n:callout
    n:conditionalText n:conditionalCheckbox n:conditionalValue e:caption e:keepNext n:editorImage n:pageBreak n:headingNumberingConfig n:toc
    e:tabNavigation e:clearHistory
  `);
  const NODES = words(`
    paragraph blockquote bulletList codeBlock hardBreak heading horizontalRule listItem orderedList text doc taskList taskItem varBadge
    calcBadge pageNumberBadge smartChip footnoteRef table tableRow tableHeader tableCell twoColumnsColumn twoColumnsZone callout
    conditionalText conditionalCheckbox conditionalValue editorImage pageBreak headingNumberingConfig toc
  `);
  const MARKS = words('link insertion deletion textStyle bold code italic strike underline superscript subscript commentMark modification');
  // Les plugins qui portent un nom, dans l'ordre de l'état de l'éditeur (les autres s'appellent `plugin$`, `plugin$1`...).
  const NAMED_PLUGINS = words(`
    gridEditor$ emailPlainText$ textExpansionSuggestion$ suggestion$ autolink$ handleClickLink$ handlePasteLink$ captionPlaceholder$ tableColumnResizing$ selectingCells$
    ppFindReplace$ behindImageClickThrough$ floatingImageKeep$ conditionalValueInput$ @handlewithcare/prosemirror-suggest-changes$
    tiptap__placeholder$ trailingNode$ history$ codeBlockVSCodeHandler$ textDirection$ tiptapPaste$ tiptapDrop$ tabindex$ clearDocument$ focusEvents$
    clipboardTextSerializer$ editable$
  `);
  const PLUGIN_COUNT = 136; // dont deux d'emailPlainText (js/email-plain-text.js) et un plugin de clavier par marque d'exposant et d'indice (js/script-marks.js)

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
    description: 'une modification du texte recalcule la pagination, la hauteur des zones et les largeurs de colonnes (onUpdate)',
    run: () => {
      const calls = { pagination: 0, zones: 0 };
      const { schedulePaginationRecompute, enforceZoneHeightLimit } = HeaderFooterPreview;
      HeaderFooterPreview.schedulePaginationRecompute = () => { calls.pagination++; };
      HeaderFooterPreview.enforceZoneHeightLimit = () => { calls.zones++; };
      try {
        editor().commands.setContent('<p>Bonjour</p>');
        calls.pagination = 0;
        calls.zones = 0;
        editor().commands.insertContent('!');
      } finally {
        HeaderFooterPreview.schedulePaginationRecompute = schedulePaginationRecompute;
        HeaderFooterPreview.enforceZoneHeightLimit = enforceZoneHeightLimit;
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
