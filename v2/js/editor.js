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
// taille/police réelles) et les variables #Variable (badge + autocomplétion
// + résolution en mode Lecture, cf. js/variables.js). PAS ENCORE couverts
// (prochains incréments) : tableaux, zone 2 colonnes, images, sommaire/
// numérotation de titres, export PDF, configuration de règle inter-tables à
// l'insertion (modale dédiée de la V1). `getHTML`/`setHTML` sont
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
