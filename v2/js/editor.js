// Éditeur V2 — TipTap/ProseMirror (remplace Quill, cf. plan d'architecture).
// Script CLASSIQUE (pas type="module") : les paquets TipTap/ProseMirror sont
// chargés via import() DYNAMIQUE à l'intérieur de init() plutôt que via des
// imports statiques ES module - un import() dynamique respecte la <script
// type="importmap"> de v2/index.html au même titre qu'un import statique,
// mais reste utilisable depuis un script classique. Ça évite d'avoir à faire
// de v2/js/editor.js un vrai module ES, ce qui aurait cassé le partage de
// portée global avec GristAPI/Templates/ReaderMode (chargés en scripts
// classiques, comme le reste du projet) - un module ES ne voit JAMAIS les
// `const` de niveau racine d'un autre script, même classique.
//
// Incrément agile en cours : couvre à ce stade le flux principal (titres,
// gras/italique/souligné/barré, alignement, listes, citation, undo/redo,
// taille/police réelles), les variables #Variable (badge + autocomplétion
// + résolution en mode Lecture, cf. js/variables.js) et les tableaux
// (@tiptap/extension-table officiel) et les zones 2 colonnes (paire de
// nœuds personnalisés twoColumnsZone/twoColumnsColumn, même principe -
// une colonne accepte du contenu riche directement dans le même schéma de
// document, cf. plan : aucune instance imbriquée nécessaire, contrairement
// à la V1/Quill) et les images (insertion basique par URL, cf. EditorImage
// ci-dessous). PAS ENCORE couverts (prochains incréments, le gros morceau à
// venir étant l'export PDF) : calque devant/derrière + repositionnement par
// glisser d'une image (V1 : image-floating/ancrage, système complexe non
// repris pour cet incrément), sommaire/numérotation de titres,
// export PDF, configuration de règle inter-tables à l'insertion (modale
// dédiée de la V1), redimensionnement du ratio des colonnes (2 colonnes
// égales pour l'instant). `getHTML`/`setHTML` sont
// volontairement la même forme d'API que l'éditeur V1 (js/editor.js), pour
// que main.js et les modules partagés (Templates/ReaderMode) s'intègrent
// sans surprise.
const Editor = (function () {
  let editor = null;

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

    // Badge de variable #Variable — nœud "atome" en ligne, non éditable au
    // caractère près (contenteditable="false"), même forme HTML que l'éditeur
    // V1 (js/editor.js:VarBadgeBlot) pour que reader-mode.js/pdf-export.js
    // (v1, réutilisés tels quels pour l'instant) le reconnaissent sans
    // changement : <span class="var-badge" data-table data-column data-key>.
    const VarBadge = Node.create({
      name: 'varBadge',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        // renderHTML: () => ({}) sur chaque attribut : sans ça, TipTap
        // rend CHAQUE attribut par défaut comme un attribut HTML bare
        // (table="..."/column="..."/key="...") EN PLUS des data-table/
        // data-column/data-key posés à la main juste en dessous - un doublon
        // constaté en conditions réelles. Ces attributs ne doivent exister
        // QUE dans le JSON interne du nœud ProseMirror, leur rendu HTML est
        // entièrement pris en charge par le renderHTML du nœud lui-même.
        const noBareRender = { default: null, renderHTML: () => ({}) };
        return {
          table: noBareRender,
          column: noBareRender,
          key: noBareRender,
        };
      },
      parseHTML() {
        return [{
          tag: 'span.var-badge',
          getAttrs: el => ({ table: el.getAttribute('data-table'), column: el.getAttribute('data-column'), key: el.getAttribute('data-key') }),
        }];
      },
      renderHTML({ HTMLAttributes, node }) {
        return ['span', mergeAttributes(HTMLAttributes, {
          class: 'var-badge', contenteditable: 'false',
          'data-table': node.attrs.table, 'data-column': node.attrs.column, 'data-key': node.attrs.key,
        }), '#' + node.attrs.key];
      },
    });

    // `FontFamily` (paquet officiel) n'ÉTEND PAS 'textStyle' lui-même : c'est
    // une extension à part qui AUGMENTE la marque 'textStyle' via
    // `addGlobalAttributes` - la marque elle-même doit être enregistrée
    // séparément (`TextStyle` ci-dessus), sans quoi ProseMirror lève "There is
    // no mark type named 'textStyle'" (confirmé en conditions réelles).
    // `FontSize` suit exactement le même schéma que Color/FontFamily dans
    // l'écosystème officiel : une extension indépendante qui cible
    // `types: ['textStyle']`, jamais une sous-classe.
    const FontSize = Extension.create({
      name: 'fontSize',
      addGlobalAttributes() {
        return [{
          types: ['textStyle'],
          attributes: {
            fontSize: {
              default: null,
              parseHTML: el => el.style.fontSize || null,
              renderHTML: attrs => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
            },
          },
        }];
      },
      addCommands() {
        return {
          setFontSize: fontSize => ({ chain }) => chain().setMark('textStyle', { fontSize }).run(),
        };
      },
    });

    // Zone 2 colonnes — pas d'extension officielle équivalente à
    // extension-table ; construite comme une paire de nœuds suivant le même
    // principe d'imbrication (une colonne accepte du contenu riche
    // directement dans le schéma, cf. tableau ci-dessus). Mêmes noms de
    // classe que la V1 (.two-columns-zone/.two-columns-column) pour limiter
    // l'adaptation de pdf-export.js le moment venu. `isolating: true` sur les
    // deux nœuds : empêche backspace/suppr en bord de colonne de fusionner
    // la zone avec le paragraphe voisin (comportement par défaut de
    // ProseMirror sans ça, vérifié en conditions réelles). Pas encore de
    // poignée de redimensionnement (ratio des colonnes) - incrément
    // ultérieur, comme le resize de tableau a suivi séparément en V1.
    const TwoColumnsColumn = Node.create({
      name: 'twoColumnsColumn',
      content: 'block+',
      isolating: true,
      parseHTML() { return [{ tag: 'div.two-columns-column' }]; },
      renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { class: 'two-columns-column' }), 0]; },
    });
    const TwoColumnsZone = Node.create({
      name: 'twoColumnsZone',
      group: 'block',
      content: 'twoColumnsColumn twoColumnsColumn',
      isolating: true,
      parseHTML() { return [{ tag: 'div.two-columns-zone' }]; },
      renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { class: 'two-columns-zone' }), 0]; },
      addCommands() {
        return {
          insertTwoColumns: () => ({ chain }) => chain().insertContent({
            type: this.name,
            content: [
              { type: 'twoColumnsColumn', content: [{ type: 'paragraph' }] },
              { type: 'twoColumnsColumn', content: [{ type: 'paragraph' }] },
            ],
          }).run(),
        };
      },
    });

    // Image — nœud "atome" en ligne, insertion basique par URL pour cet
    // incrément (V1 : image-floating/ancrage avec calque devant/derrière et
    // repositionnement par glisser, cf. mémoire
    // project_image_anchor_bracketing_interpolation - hors scope ici, à
    // reprendre une fois l'export PDF V2 en chantier puisque c'est
    // essentiellement pour l'export que ce système existe). `src`/`alt`
    // restent des attributs HTML bruts de l'<img> (contrairement à
    // VarBadge : ici c'est le comportement natif souhaité, même forme que la
    // V1) ; seul `width` a besoin d'un renderHTML dédié (posé en style
    // inline, pas en attribut HTML `width`).
    const EditorImage = Node.create({
      name: 'editorImage',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        return {
          src: { default: null },
          alt: { default: 'Image' },
          width: {
            default: '320px',
            parseHTML: el => el.style.width || null,
            renderHTML: attrs => (attrs.width ? { style: `width: ${attrs.width}` } : {}),
          },
        };
      },
      parseHTML() { return [{ tag: 'img.editor-image' }]; },
      renderHTML({ HTMLAttributes }) {
        return ['img', mergeAttributes(HTMLAttributes, { class: 'editor-image', draggable: 'false' })];
      },
      addCommands() {
        return {
          insertImage: attrs => ({ chain }) => chain().insertContent({ type: this.name, attrs }).run(),
        };
      },
    });

    editor = new TiptapEditor({
      element: document.getElementById('editor-container'),
      extensions: [
        StarterKit,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TextStyle,
        FontFamily,
        FontSize,
        VarBadge,
        Variables.createExtension(Extension, Suggestion),
        // Tableau : extensions officielles, colonnes redimensionnables (même
        // comportement de poignée que la V1, cf. mémoire
        // project_table_resize_handle_regression) - validées dans
        // v2/smoke-test.html avec du contenu riche réel dans une cellule.
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        TwoColumnsColumn,
        TwoColumnsZone,
        EditorImage,
      ],
      content: '',
    });

    wireToolbar();
    return editor;
  }

  // Une seule instance, une seule toolbar : chaque bouton appelle directement
  // une commande TipTap sur la sélection réelle - plus besoin de savoir "suis-je
  // dans une cellule/colonne" avant d'agir (contrairement à l'éditeur V1), et
  // plus aucun execCommand.
  function wireToolbar() {
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bind('v2-btn-bold', () => editor.chain().focus().toggleBold().run());
    bind('v2-btn-italic', () => editor.chain().focus().toggleItalic().run());
    bind('v2-btn-underline', () => editor.chain().focus().toggleUnderline().run());
    bind('v2-btn-strike', () => editor.chain().focus().toggleStrike().run());
    bind('v2-btn-align-left', () => editor.chain().focus().setTextAlign('left').run());
    bind('v2-btn-align-center', () => editor.chain().focus().setTextAlign('center').run());
    bind('v2-btn-align-right', () => editor.chain().focus().setTextAlign('right').run());
    bind('v2-btn-align-justify', () => editor.chain().focus().setTextAlign('justify').run());
    bind('v2-btn-bullet', () => editor.chain().focus().toggleBulletList().run());
    bind('v2-btn-ordered', () => editor.chain().focus().toggleOrderedList().run());
    bind('v2-btn-blockquote', () => editor.chain().focus().toggleBlockquote().run());
    bind('v2-btn-table', () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run());
    bind('v2-btn-col-before', () => editor.chain().focus().addColumnBefore().run());
    bind('v2-btn-col-after', () => editor.chain().focus().addColumnAfter().run());
    bind('v2-btn-col-del', () => editor.chain().focus().deleteColumn().run());
    bind('v2-btn-row-before', () => editor.chain().focus().addRowBefore().run());
    bind('v2-btn-row-after', () => editor.chain().focus().addRowAfter().run());
    bind('v2-btn-row-del', () => editor.chain().focus().deleteRow().run());
    bind('v2-btn-table-del', () => editor.chain().focus().deleteTable().run());
    bind('v2-btn-two-columns', () => editor.chain().focus().insertTwoColumns().run());
    bind('v2-btn-image', () => {
      const url = window.prompt('URL de l\'image :');
      if (!url) return;
      editor.chain().focus().insertImage({ src: url, alt: 'Image', width: '320px' }).run();
    });
    bind('v2-btn-undo', () => editor.chain().focus().undo().run());
    bind('v2-btn-redo', () => editor.chain().focus().redo().run());
    // Un <select> (contrairement à un <button>) vole le focus DÈS le
    // pointerdown, AVANT même l'évènement 'change' - le focus quittant
    // l'éditeur, la sélection réelle qu'on veut mettre en forme peut être
    // perdue d'ici là. On la capture donc au pointerdown (position ProseMirror
    // {from,to}, un simple couple de nombres - PAS besoin de manipuler un
    // Range DOM comme le faisait l'éditeur V1) et on la restaure
    // explicitement juste avant d'appliquer la commande, plutôt que de
    // compter sur .focus() seul pour la retrouver.
    let savedSelection = null;
    const captureSelection = () => { const { from, to } = editor.state.selection; savedSelection = { from, to }; };
    const withSavedSelection = (fn) => {
      const chain = editor.chain().focus();
      if (savedSelection) chain.setTextSelection(savedSelection);
      fn(chain);
      chain.run();
    };
    const bindSelect = (id, onChange) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', captureSelection);
      el.addEventListener('change', () => onChange(el.value));
    };
    bindSelect('v2-header-select', value => withSavedSelection(chain => {
      if (value === 'p') chain.setParagraph(); else chain.toggleHeading({ level: parseInt(value, 10) });
    }));
    bindSelect('v2-size-select', value => { if (value) withSavedSelection(chain => chain.setFontSize(value)); });
    bindSelect('v2-font-select', value => { if (value) withSavedSelection(chain => chain.setFontFamily(value)); });
  }

  function getHTML() { return editor ? editor.getHTML() : ''; }
  function setHTML(html) { if (editor) editor.commands.setContent(html || '', { emitUpdate: false }); }

  return { init, getHTML, setHTML };
})();
