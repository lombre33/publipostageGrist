// Éditeur V2 — TipTap/ProseMirror (remplace Quill, cf. plan d'architecture).
//
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
// `getHTML`/`setHTML` gardent volontairement la même forme d'API que
// l'éditeur V1 (js/editor.js), pour que main.js et les modules partagés
// (Templates/ReaderMode) s'intègrent sans surprise.
//
// Les nœuds/extensions personnalisés (VarBadge, tableaux 2 colonnes, image,
// saut de page, numérotation des titres, sommaire) ont besoin des classes
// TipTap (Node/Extension/mergeAttributes), qui n'existent qu'APRÈS résolution
// de l'import() dynamique ci-dessus - ils sont donc construits par de petites
// fonctions `createXxx(...)` qui reçoivent ces classes en paramètre, plutôt
// que déclarés en haut de fichier. `init()` ne fait qu'appeler ces fonctions
// et assembler le résultat - la définition de chaque nœud reste isolée et
// nommée, au lieu de gonfler `init()` lui-même.
const Editor = (function () {
  let editor = null;
  // Rempli dans init() après l'import dynamique de @floating-ui/dom (déjà
  // épinglé dans l'importmap de v2/index.html mais jamais utilisé jusqu'ici) -
  // conservé en variable de module pour que createFloatingPanel (utilisé pour
  // la toolbar de tableau, puis celle de l'image) n'ait pas besoin de refaire
  // l'import à chaque appel.
  let floatingUi = null;

  // Badge de variable #Variable — nœud "atome" en ligne, non éditable au
  // caractère près (contenteditable="false"), même forme HTML que l'éditeur
  // V1 (js/editor.js:VarBadgeBlot) pour que reader-mode.js/pdf-export.js
  // le reconnaissent sans changement :
  // <span class="var-badge" data-table data-column data-key>.
  function createVarBadgeNode(Node, mergeAttributes) {
    return Node.create({
      name: 'varBadge',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        // renderHTML: () => ({}) sur chaque attribut : sans ça, TipTap rend
        // CHAQUE attribut par défaut comme un attribut HTML bare
        // (table="..."/column="..."/key="...") EN PLUS des data-table/
        // data-column/data-key posés à la main dans renderHTML ci-dessous -
        // un doublon constaté en conditions réelles. Ces attributs ne
        // doivent exister QUE dans le JSON interne du nœud ProseMirror.
        const noBareRender = { default: null, renderHTML: () => ({}) };
        return { table: noBareRender, column: noBareRender, key: noBareRender };
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
  }

  // `FontFamily` (paquet officiel, câblé dans init() ci-dessous) n'ÉTEND PAS
  // 'textStyle' lui-même : c'est une extension à part qui AUGMENTE la marque
  // 'textStyle' via `addGlobalAttributes` - la marque elle-même doit être
  // enregistrée séparément (`TextStyle`, également câblée dans init()), sans
  // quoi ProseMirror lève "There is no mark type named 'textStyle'" (confirmé
  // en conditions réelles). `FontSize` suit exactement le même schéma que
  // Color/FontFamily dans l'écosystème officiel : une extension indépendante
  // qui cible `types: ['textStyle']`, jamais une sous-classe.
  function createFontSizeExtension(Extension) {
    return Extension.create({
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
        return { setFontSize: fontSize => ({ chain }) => chain().setMark('textStyle', { fontSize }).run() };
      },
    });
  }

  // Zone 2 colonnes — pas d'extension officielle équivalente à
  // extension-table ; construite comme une paire de nœuds suivant le même
  // principe d'imbrication (une colonne accepte du contenu riche directement
  // dans le schéma). Mêmes noms de classe que la V1
  // (.two-columns-zone/.two-columns-column) pour limiter l'adaptation de
  // pdf-export.js. `isolating: true` sur les deux nœuds : empêche
  // backspace/suppr en bord de colonne de fusionner la zone avec le
  // paragraphe voisin (comportement par défaut de ProseMirror sans ça,
  // vérifié en conditions réelles). Pas encore de poignée de
  // redimensionnement (ratio des colonnes) - les deux colonnes sont toujours
  // 50/50 pour l'instant.
  function createTwoColumnsNodes(Node, mergeAttributes) {
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
    return { TwoColumnsColumn, TwoColumnsZone };
  }

  // Image — nœud "atome" en ligne, insertion basique par URL. V1 a en plus un
  // calque devant/derrière avec repositionnement par glisser (cf. mémoire
  // project_image_anchor_bracketing_interpolation) : système entièrement au
  // service de l'export PDF, pas encore porté ici - à construire quand ce
  // besoin deviendra concret (cf. mémoire
  // feedback_v2_defer_complexity_to_pdf_phase), pas avant. `src`/`alt`
  // restent des attributs HTML bruts de l'<img> (contrairement à VarBadge :
  // ici c'est le comportement natif souhaité) ; seul `width` a besoin d'un
  // renderHTML dédié (posé en style inline, pas en attribut HTML `width`).
  function createEditorImageNode(Node, mergeAttributes) {
    return Node.create({
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
        return { insertImage: attrs => ({ chain }) => chain().insertContent({ type: this.name, attrs }).run() };
      },
    });
  }

  // Saut de page forcé — nœud "atome" de bloc, même classe que la V1
  // (.page-break-marker) pour que pdf-export.js le reconnaisse tel quel ;
  // aucun contenu ProseMirror réel (comme VarBadge), le libellé n'existe que
  // dans le rendu.
  function createPageBreakNode(Node) {
    return Node.create({
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
  }

  // Numérotation des titres — configuration invisible persistée DANS le
  // contenu (un nœud de plus, comme PageBreak), plutôt que dans une colonne
  // Grist séparée : évite toute migration de schéma sur la table des modèles
  // déjà existante (même choix que la V1, cf. HeadingNumberingConfigBlot).
  // Attribut interne nommé `numberingStyle` (PAS `style`, qui collisionnerait
  // avec l'attribut HTML `style=` lors du rendu bare par défaut) ; sérialisé
  // en `data-style` pour rester lisible par reader-mode.js (réutilisé tel
  // quel) et par les compteurs CSS (cf. css/editor-v2.css, sur `.tiptap`).
  function createHeadingNumberingConfigNode(Node) {
    return Node.create({
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
  }

  // Sommaire — nœud "atome" de bloc. Le HTML SÉRIALISÉ (`getHTML()`, utilisé
  // pour l'enregistrement) reste un simple placeholder statique, comme la V1
  // (résolu en vraie liste de titres par reader-mode.js/pdf-export.js au
  // rendu, pas ici). L'éditeur affiche en revanche un aperçu VIVANT via un
  // NodeView personnalisé : contrairement à la V1 (où muter le DOM
  // directement dans .ql-editor risquait de déclencher une boucle avec le
  // MutationObserver de Quill, cf. mémoire project_quill_mutation_observer),
  // un NodeView ProseMirror possède son propre sous-arbre DOM et
  // `ignoreMutation: () => true` suffit à l'isoler proprement du modèle - pas
  // besoin de signature de garde anti-boucle ici.
  function createTocNode(Node) {
    return Node.create({
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
            HeadingNumbering.entriesFor(headingEls, style).forEach(entry => {
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
  }

  // En mode Aperçu A4, un tableau ne doit jamais dépasser la largeur de page
  // réelle : signalé par l'utilisateur - agrandir une colonne à la main au
  // point de manquer de place poussait le reste du tableau hors de la
  // feuille (un <col> avec une largeur EXPLICITE n'a, contrairement à
  // min-width, aucun plafond naturel - une largeur de 900px déborde
  // simplement le conteneur, vérifié en conditions réelles). L'extension
  // officielle de redimensionnement n'expose pas de crochet pendant le
  // glisser lui-même ; ce correctif tourne donc sur CHAQUE mise à jour
  // (comme le NodeView du sommaire ci-dessus) et rétrécit après coup les
  // colonnes EXPLICITEMENT redimensionnées (attribut `colwidth` réel,
  // jamais les colonnes "auto" par défaut - déjà couvertes par le
  // `min-width: 0` de css/editor-v2.css) dès que la largeur totale dépasse
  // le conteneur - perçu comme un léger rebond juste après avoir relâché la
  // poignée plutôt qu'une résistance pendant le glisser, mais garantit que
  // le tableau ne peut jamais rester plus large que la page.
  const DEFAULT_COL_PX = 25;
  function clampOverflowingTables(currentEditor) {
    const editorContainer = document.getElementById('editor-container');
    if (!editorContainer || !editorContainer.classList.contains('a4-preview')) return;
    // clientWidth de .tiptap (racine ProseMirror) inclut SON PROPRE padding
    // (37.33px de chaque côté en Aperçu A4, cf. css/editor-v2.css) - retiré
    // ici pour obtenir la largeur réellement disponible pour un enfant
    // direct comme le tableau, pas la boîte entière de la racine.
    const rootEl = currentEditor.view.dom;
    const rootCs = getComputedStyle(rootEl);
    const containerWidth = rootEl.clientWidth - (parseFloat(rootCs.paddingLeft) || 0) - (parseFloat(rootCs.paddingRight) || 0);
    if (!containerWidth) return;
    const { state } = currentEditor;
    let tr = null;
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'table') return true;
      const firstRow = node.firstChild;
      if (!firstRow) return false;
      // Le total/l'échelle se calculent sur la seule première ligne (les
      // largeurs de colonne sont censées être identiques sur toutes les
      // lignes), mais le correctif doit être appliqué à TOUTES LES LIGNES -
      // sinon la ligne 2+ garde son ancienne largeur de colonne, et
      // prosemirror-tables (qui exige une largeur cohérente par colonne à
      // travers toutes les lignes) annule silencieusement la correction de
      // la ligne 1 pour la réaligner sur cette valeur restée plus grande
      // (vérifié en conditions réelles : un tableau à une seule ligne se
      // corrigeait, un tableau à deux lignes non).
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

  // Aide générique pour une toolbar contextuelle flottante, positionnée par
  // @floating-ui/dom plutôt que par du calcul manuel de getBoundingClientRect
  // (ce que faisait la V1 pour sa propre toolbar de tableau, js/editor.js:1122)
  // - réutilisée ici pour le tableau, et pour l'image dans un incrément
  // suivant. Ancrée dans document.body (pas #editor-container) : évite tout
  // souci de contexte d'empilement/débordement avec un ancêtre (cf. mémoire
  // project_stacking_context_trap), même principe que les overlays flottants
  // de la V1.
  function createFloatingPanel(className, innerHTML, onAction) {
    const el = document.createElement('div');
    el.className = className;
    el.innerHTML = innerHTML;
    // mousedown (pas click) + preventDefault : évite qu'un clic sur un bouton
    // du panneau ne fasse d'abord perdre le focus/la sélection ProseMirror
    // avant que l'action ne s'exécute - même piège que les <select> de la
    // toolbar principale (cf. wireSelectionDependentSelects).
    el.addEventListener('mousedown', (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      event.preventDefault();
      onAction(btn.dataset.action);
    });
    document.body.appendChild(el);
    let stopAutoUpdate = null;
    return {
      show(referenceEl) {
        el.classList.add('visible');
        const update = () => {
          floatingUi.computePosition(referenceEl, el, {
            placement: 'top',
            middleware: [floatingUi.offset(8), floatingUi.flip(), floatingUi.shift({ padding: 8 })],
          }).then(({ x, y }) => { el.style.left = `${x}px`; el.style.top = `${y}px`; });
        };
        if (stopAutoUpdate) stopAutoUpdate();
        stopAutoUpdate = floatingUi.autoUpdate(referenceEl, el, update);
      },
      hide() {
        el.classList.remove('visible');
        if (stopAutoUpdate) { stopAutoUpdate(); stopAutoUpdate = null; }
      },
    };
  }

  // Toolbar de gestion de tableau (ajout/suppr ligne/colonne, suppr tableau) -
  // déplacée hors du bandeau statique (où elle restait affichée même sans
  // aucun tableau dans le document) vers un panneau flottant qui n'apparaît
  // que le curseur dans une cellule, ancré sur le <table> réel. `v2-btn-table`
  // (insertion) reste dans le bandeau statique : seule la gestion d'un
  // tableau déjà présent a besoin d'un contexte "curseur dans une cellule".
  function wireTableFloatingToolbar() {
    const buttons = [
      ['row-before', 'rowBefore', 'Ligne avant'],
      ['row-after', 'rowAfter', 'Ligne après'],
      ['row-del', 'rowDel', 'Supprimer la ligne'],
      ['col-before', 'colBefore', 'Colonne avant'],
      ['col-after', 'colAfter', 'Colonne après'],
      ['col-del', 'colDel', 'Supprimer la colonne'],
      ['table-del', 'trash', 'Supprimer le tableau'],
    ];
    const html = buttons.map(([action, icon, title]) =>
      `<button data-action="${action}" title="${title}">${Icons.svg(icon)}</button>`).join('');
    const panel = createFloatingPanel('v2-floating-toolbar', html, (action) => {
      const commands = {
        'row-before': () => editor.chain().focus().addRowBefore().run(),
        'row-after': () => editor.chain().focus().addRowAfter().run(),
        'row-del': () => editor.chain().focus().deleteRow().run(),
        'col-before': () => editor.chain().focus().addColumnBefore().run(),
        'col-after': () => editor.chain().focus().addColumnAfter().run(),
        'col-del': () => editor.chain().focus().deleteColumn().run(),
        'table-del': () => editor.chain().focus().deleteTable().run(),
      };
      (commands[action] || (() => {}))();
    });
    const check = () => {
      if (!editor.isActive('table')) { panel.hide(); return; }
      const { $from } = editor.state.selection;
      let tableDepth = -1;
      for (let d = $from.depth; d > 0; d--) { if ($from.node(d).type.name === 'table') { tableDepth = d; break; } }
      if (tableDepth === -1) { panel.hide(); return; }
      // nodeDOM d'un nœud table renvoie le wrapper (.tableWrapper) posé par
      // la NodeView interne de prosemirror-tables, pas le <table> lui-même -
      // redescend dessus pour un ancrage visuel correct.
      const dom = editor.view.nodeDOM($from.before(tableDepth));
      if (!dom) { panel.hide(); return; }
      const tableEl = dom.tagName === 'TABLE' ? dom : (dom.querySelector && dom.querySelector('table')) || dom;
      panel.show(tableEl);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  // Icônes de la toolbar statique (posées en JS plutôt que dans le HTML : une
  // seule source de vérité pour les tracés SVG, partagée avec les toolbars
  // flottantes ci-dessus/ci-dessous qui doivent de toute façon construire
  // leur contenu en JS - cf. v2/js/icons.js).
  function applyToolbarIcons() {
    const set = (id, icon) => { const el = document.getElementById(id); if (el) el.innerHTML = Icons.svg(icon); };
    set('v2-btn-bold', 'bold'); set('v2-btn-italic', 'italic');
    set('v2-btn-underline', 'underline'); set('v2-btn-strike', 'strike');
    set('v2-btn-align-left', 'alignLeft'); set('v2-btn-align-center', 'alignCenter');
    set('v2-btn-align-right', 'alignRight'); set('v2-btn-align-justify', 'alignJustify');
    set('v2-btn-bullet', 'bulletList'); set('v2-btn-ordered', 'orderedList');
    set('v2-btn-blockquote', 'blockquote'); set('v2-btn-table', 'table');
    set('v2-btn-two-columns', 'twoColumns'); set('v2-btn-image', 'image');
    set('v2-btn-page-break', 'pageBreak'); set('v2-btn-toc', 'toc');
    set('v2-btn-undo', 'undo'); set('v2-btn-redo', 'redo');
  }

  // Retour visuel d'état actif (aucun jusqu'ici : un bouton gras ne montrait
  // pas que le curseur est déjà dans du texte en gras). Recalculé à chaque
  // sélection/transaction plutôt que seulement au clic, pour rester juste
  // aussi quand la sélection change au clavier/à la souris sans passer par la
  // toolbar. Inclut aussi `v2-header-select`, pour la même raison (montrer
  // "Titre 2" quand le curseur est dans un H2, pas seulement "Normal" figé).
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
    setActive('v2-btn-bullet', editor.isActive('bulletList'));
    setActive('v2-btn-ordered', editor.isActive('orderedList'));
    setActive('v2-btn-blockquote', editor.isActive('blockquote'));
    const headerSelect = document.getElementById('v2-header-select');
    if (headerSelect) {
      let value = 'p';
      for (let level = 1; level <= 6; level++) { if (editor.isActive('heading', { level })) value = String(level); }
      if (headerSelect.value !== value) headerSelect.value = value;
    }
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
    const { computePosition, offset, flip, shift, autoUpdate } = await import('@floating-ui/dom');
    floatingUi = { computePosition, offset, flip, shift, autoUpdate };

    const VarBadge = createVarBadgeNode(Node, mergeAttributes);
    const FontSize = createFontSizeExtension(Extension);
    const { TwoColumnsColumn, TwoColumnsZone } = createTwoColumnsNodes(Node, mergeAttributes);
    const EditorImage = createEditorImageNode(Node, mergeAttributes);
    const PageBreak = createPageBreakNode(Node);
    const HeadingNumberingConfig = createHeadingNumberingConfigNode(Node);
    const Toc = createTocNode(Node);

    editor = new TiptapEditor({
      element: document.getElementById('editor-container'),
      onUpdate: ({ editor: updatedEditor }) => clampOverflowingTables(updatedEditor),
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
    wireTableFloatingToolbar();
    editor.on('selectionUpdate', syncToolbarState);
    editor.on('transaction', syncToolbarState);
    return editor;
  }

  // Une seule instance, une seule toolbar : chaque bouton appelle directement
  // une commande TipTap sur la sélection réelle - plus besoin de savoir "suis-je
  // dans une cellule/colonne" avant d'agir (contrairement à l'éditeur V1), et
  // plus aucun execCommand.
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
    bind('v2-btn-bullet', () => editor.chain().focus().toggleBulletList().run());
    bind('v2-btn-ordered', () => editor.chain().focus().toggleOrderedList().run());
    bind('v2-btn-blockquote', () => editor.chain().focus().toggleBlockquote().run());
    // withHeaderRow: false - un tableau inséré n'a pas de style de première
    // ligne différent des autres (signalé par l'utilisateur : gras + fond
    // coloré inattendus par défaut, cf. aussi css/editor-v2.css).
    bind('v2-btn-table', () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run());
    // Gestion ligne/colonne/suppression de tableau : déplacée vers la
    // toolbar flottante contextuelle, cf. wireTableFloatingToolbar.
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

    wireHeadingNumberingSelect();
    wireSelectionDependentSelects();
  }

  // Réglage de DOCUMENT (numérotation des titres), pas une mise en forme de
  // sélection : contrairement aux <select> ci-dessous, pas besoin de
  // capturer/restaurer la sélection texte, seul le focus est rendu à
  // l'éditeur par confort. Le data-attribute est posé AVANT de dispatcher la
  // commande (qui déclenche elle-même, synchronement, le rafraîchissement du
  // sommaire via son NodeView) afin que ce rafraîchissement lise déjà la
  // bonne valeur.
  function wireHeadingNumberingSelect() {
    const select = document.getElementById('v2-heading-numbering-select');
    if (!select) return;
    select.addEventListener('change', () => {
      editor.view.dom.dataset.headingStyle = select.value;
      editor.chain().setHeadingNumberingStyle(select.value).focus().run();
    });
  }

  // Un <select> de mise en forme (titre/taille/police), contrairement à un
  // <button>, vole le focus DÈS le pointerdown, AVANT même l'évènement
  // 'change' - le focus quittant l'éditeur, la sélection réelle qu'on veut
  // mettre en forme peut être perdue d'ici là. On la capture donc au
  // pointerdown (position ProseMirror {from,to}, un simple couple de nombres
  // - PAS besoin de manipuler un Range DOM comme le faisait l'éditeur V1) et
  // on la restaure explicitement juste avant d'appliquer la commande, plutôt
  // que de compter sur .focus() seul pour la retrouver.
  function wireSelectionDependentSelects() {
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
    // valeur ci-dessus vient d'être posée mais le NodeView du sommaire a déjà
    // fait son premier rendu (pendant setContent, donc AVANT). On force un
    // rafraîchissement en dispatchant une transaction sans changement de
    // document - même idée que `quill.update(Quill.sources.SILENT)` en V1
    // pour resynchroniser l'affichage après une modification externe au flux
    // normal d'édition.
    editor.view.dispatch(editor.state.tr);
    // Un modèle chargé peut aussi contenir un tableau déjà trop large (créé
    // avant ce correctif, ou importé) - le dispatch juste au-dessus ne
    // déclenche PAS onUpdate (transaction sans changement réel), donc
    // clampOverflowingTables ne tourne jamais tout seul pour ce cas précis ;
    // appelé explicitement ici pour le couvrir aussi.
    clampOverflowingTables(editor);
  }

  return { init, getHTML, setHTML, getHeadingNumberingStyle };
})();
