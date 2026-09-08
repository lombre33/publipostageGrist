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
// à la V1/Quill), les images (insertion basique par URL, cf. EditorImage
// ci-dessous), le saut de page forcé et le sommaire + numérotation des
// titres (mêmes classes/attributs HTML que la V1 pour que reader-mode.js,
// réutilisé tel quel, les résolve sans changement). PAS ENCORE couverts
// (prochains incréments, le gros morceau à venir étant l'export PDF) :
// calque devant/derrière + repositionnement par glisser d'une image (V1 :
// image-floating/ancrage, système complexe non repris pour cet incrément),
// export PDF, configuration de règle inter-tables à l'insertion (modale
// dédiée de la V1), redimensionnement du ratio des colonnes (2 colonnes
// égales pour l'instant). `getHTML`/`setHTML` sont
// volontairement la même forme d'API que l'éditeur V1 (js/editor.js), pour
// que main.js et les modules partagés (Templates/ReaderMode) s'intègrent
// sans surprise.
const Editor = (function () {
  let editor = null;

  // Reproduit en JS la cascade de compteurs CSS de css/editor-v2.css
  // (.tiptap[data-heading-style] > h1..h6), pour l'aperçu vivant du sommaire
  // (cf. Toc.addNodeView). Duplique volontairement la même logique que
  // ../js/reader-mode.js:headingCounterEntries (petite fonction pure,
  // autonome - pas de dépendance croisée entre un module d'édition et un
  // module de rendu lecture pour ça) ; les deux DOIVENT rester synchronisées
  // si le schéma de numérotation (css/style.css) change. Ne PAS lire
  // getComputedStyle(h, '::before').content pour ça : ne renvoie que la
  // valeur CSS déclarée (ex. littéralement "counter(h1c)"), jamais le texte
  // réellement peint à l'écran - vérifié en conditions réelles, Chrome à
  // jour ne résout pas `counter()` via la CSSOM.
  const HEADING_COUNTER_SCHEMES = {
    numeric: ['decimal', 'lower-alpha', 'upper-roman', 'decimal', 'lower-alpha', 'upper-roman'],
    alpha: ['lower-alpha', 'upper-roman', 'decimal', 'lower-alpha', 'upper-roman', 'decimal'],
    roman: ['upper-roman', 'decimal', 'lower-alpha', 'upper-roman', 'decimal', 'lower-alpha'],
  };
  function formatCounterValue(n, counterStyle) {
    if (counterStyle === 'lower-alpha') { let s = ''; let v = n; while (v > 0) { const rem = (v - 1) % 26; s = String.fromCharCode(97 + rem) + s; v = Math.floor((v - 1) / 26); } return s; }
    if (counterStyle === 'upper-roman') { const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; let v = n; table.forEach(([val, sym]) => { while (v >= val) { s += sym; v -= val; } }); return s; }
    return String(n);
  }
  function headingCounterEntries(headingEls, numberingStyle) {
    const scheme = HEADING_COUNTER_SCHEMES[numberingStyle];
    const counters = [0, 0, 0, 0, 0, 0];
    return headingEls.map(h => {
      const level = parseInt(h.tagName.slice(1), 10) || 1;
      counters[level - 1] += 1;
      for (let i = level; i < 6; i += 1) counters[i] = 0;
      const marker = scheme ? formatCounterValue(counters[level - 1], scheme[level - 1]) + ') ' : '';
      return { level, text: (marker + (h.textContent || '')).replace(/\s+/g, ' ').trim() };
    });
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

    // Saut de page forcé — nœud "atome" de bloc, même classe que la V1
    // (.page-break-marker) pour que pdf-export.js le reconnaisse tel quel le
    // moment venu ; aucun contenu ProseMirror réel (comme VarBadge), le
    // libellé n'existe que dans le rendu.
    const PageBreak = Node.create({
      name: 'pageBreak',
      group: 'block',
      atom: true,
      selectable: true,
      parseHTML() { return [{ tag: 'div.page-break-marker' }]; },
      renderHTML() { return ['div', { class: 'page-break-marker', contenteditable: 'false' }, 'Saut de page']; },
      addCommands() {
        return { insertPageBreak: () => ({ chain }) => chain().insertContent({ type: this.name }).run() };
      },
    });

    // Numérotation des titres — configuration invisible persistée DANS le
    // contenu (un nœud de plus, comme PageBreak), plutôt que dans une colonne
    // Grist séparée : évite toute migration de schéma sur la table des
    // modèles déjà existante (même choix que la V1, cf. HeadingNumberingConfigBlot).
    // Attribut interne nommé `numberingStyle` (PAS `style`, qui collisionnerait
    // avec l'attribut HTML `style=` lors du rendu bare par défaut) ; sérialisé
    // en `data-style` pour rester lisible par reader-mode.js (réutilisé tel
    // quel) et par les compteurs CSS (cf. css/editor-v2.css, sur `.tiptap`
    // plutôt que `.ql-editor`).
    const HeadingNumberingConfig = Node.create({
      name: 'headingNumberingConfig',
      group: 'block',
      atom: true,
      selectable: false,
      addAttributes() {
        return { numberingStyle: { default: 'none', renderHTML: () => ({}) } };
      },
      parseHTML() {
        return [{ tag: 'div.heading-numbering-config', getAttrs: el => ({ numberingStyle: el.dataset.style || 'none' }) }];
      },
      renderHTML({ node }) {
        return ['div', { class: 'heading-numbering-config', contenteditable: 'false', 'data-style': node.attrs.numberingStyle }];
      },
      addCommands() {
        return {
          // Un seul nœud de config par document (comme la V1) : cherche le
          // nœud existant parmi les enfants DIRECTS du document (`doc.forEach`
          // ne descend pas dans les tableaux/colonnes/etc.), sinon l'insère en
          // tête. `dispatch` peut être absent (appel en mode "can-run" par
          // TipTap) - dans ce cas on ne doit QUE renvoyer true/false, jamais
          // muter `tr`.
          setHeadingNumberingStyle: numberingStyle => ({ tr, state, dispatch }) => {
            let foundPos = null;
            state.doc.forEach((node, pos) => { if (node.type.name === 'headingNumberingConfig') foundPos = pos; });
            if (dispatch) {
              if (foundPos !== null) tr.setNodeMarkup(foundPos, undefined, { numberingStyle });
              else tr.insert(0, state.schema.nodes.headingNumberingConfig.create({ numberingStyle }));
            }
            return true;
          },
        };
      },
    });

    // Sommaire — nœud "atome" de bloc. Le HTML SÉRIALISÉ (`getHTML()`, utilisé
    // pour l'enregistrement) reste un simple placeholder statique, comme la
    // V1 (résolu en vraie liste de titres par reader-mode.js/pdf-export.js
    // au rendu, pas ici). L'éditeur affiche en revanche un aperçu VIVANT via
    // un NodeView personnalisé : contrairement à la V1 (où muter le DOM
    // directement dans .ql-editor risquait de déclencher une boucle avec le
    // MutationObserver de Quill, cf. mémoire project_quill_mutation_observer),
    // un NodeView ProseMirror possède son propre sous-arbre DOM et
    // `ignoreMutation: () => true` suffit à l'isoler proprement du modèle -
    // pas besoin de signature de garde anti-boucle ici.
    const Toc = Node.create({
      name: 'toc',
      group: 'block',
      atom: true,
      selectable: true,
      parseHTML() { return [{ tag: 'div.toc-marker' }]; },
      renderHTML() { return ['div', { class: 'toc-marker' }, 'Sommaire (généré automatiquement à partir des titres)']; },
      addCommands() {
        return { insertToc: () => ({ chain }) => chain().insertContent({ type: this.name }).run() };
      },
      addNodeView() {
        return ({ editor: nodeViewEditor }) => {
          const dom = document.createElement('div');
          dom.className = 'toc-marker';
          const refresh = () => {
            const headingEls = Array.from(nodeViewEditor.view.dom.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
            dom.innerHTML = '';
            if (!headingEls.length) { dom.textContent = 'Sommaire (généré automatiquement à partir des titres)'; return; }
            const style = nodeViewEditor.view.dom.dataset.headingStyle || 'none';
            headingCounterEntries(headingEls, style).forEach(entry => {
              const line = document.createElement('div');
              line.className = 'toc-entry-preview';
              line.style.paddingLeft = ((entry.level - 1) * 14) + 'px';
              line.textContent = entry.text;
              dom.appendChild(line);
            });
          };
          refresh();
          nodeViewEditor.on('update', refresh);
          return { dom, ignoreMutation: () => true, destroy: () => nodeViewEditor.off('update', refresh) };
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
        PageBreak,
        HeadingNumberingConfig,
        Toc,
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
    bind('v2-btn-page-break', () => editor.chain().focus().insertPageBreak().run());
    bind('v2-btn-toc', () => editor.chain().focus().insertToc().run());
    bind('v2-btn-undo', () => editor.chain().focus().undo().run());
    bind('v2-btn-redo', () => editor.chain().focus().redo().run());
    // Réglage de document (pas une mise en forme de sélection) : pas besoin
    // du ballet capture/restauration de sélection des <select> ci-dessous,
    // seul le focus est rendu à l'éditeur par confort. Le data-attribute
    // est posé AVANT de dispatcher la commande (qui déclenche elle-même,
    // synchronement, le rafraîchissement du sommaire via son NodeView) afin
    // que ce rafraîchissement lise déjà la bonne valeur.
    const headingNumberingSelect = document.getElementById('v2-heading-numbering-select');
    if (headingNumberingSelect) {
      headingNumberingSelect.addEventListener('change', () => {
        editor.view.dom.dataset.headingStyle = headingNumberingSelect.value;
        editor.chain().setHeadingNumberingStyle(headingNumberingSelect.value).focus().run();
      });
    }
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

  function getHeadingNumberingStyle() {
    if (!editor) return 'none';
    let style = 'none';
    editor.state.doc.forEach(node => { if (node.type.name === 'headingNumberingConfig') style = node.attrs.numberingStyle; });
    return style;
  }

  function setHTML(html) {
    if (!editor) return;
    editor.commands.setContent(html || '', { emitUpdate: false });
    editor.view.dom.dataset.headingStyle = getHeadingNumberingStyle();
    // Un modèle chargé peut déjà porter une numérotation configurée : la
    // valeur ci-dessus vient d'être posée mais le NodeView du sommaire a
    // déjà fait son premier rendu (pendant setContent, donc AVANT). On force
    // un rafraîchissement en dispatchant une transaction sans changement de
    // document - même idée que `quill.update(Quill.sources.SILENT)` en V1
    // pour resynchroniser l'affichage après une modification externe au flux
    // normal d'édition.
    editor.view.dispatch(editor.state.tr);
  }

  return { init, getHTML, setHTML, getHeadingNumberingStyle };
})();
