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
  // Rempli dans init() après import de prosemirror-state (déjà partagé via
  // l'importmap, cf. en-tête de fichier) - nécessaire pour recréer
  // explicitement une NodeSelection après tr.setNodeMarkup() sur l'image
  // sélectionnée (cf. updateAttrs/updateSelectedImage) : setNodeMarkup
  // remplace le nœud (suppression+insertion) plutôt que de le muter en
  // place, et la préservation par défaut de la sélection de ProseMirror ne
  // reconstruit alors PAS forcément une NodeSelection sur ce nœud de
  // remplacement - elle retombe sur un simple curseur texte, ce qui referme
  // aussitôt la toolbar flottante (vérifié en conditions réelles).
  let NodeSelectionClass = null;
  // Alignement actuellement affiché par le bouton principal du groupe survol
  // "Alignement" (#v2-btn-align-main) - mis à jour par syncToolbarState,
  // relu par son propre clic pour réappliquer exactement ce qu'il montre.
  let currentAlign = 'left';
  // Rempli aux côtés de NodeSelectionClass ci-dessus (même import
  // prosemirror-state) - utilisé par createTabNavigationExtension pour
  // placer le curseur à un endroit précis (colonne suivante, paragraphe
  // après la zone) sans connaître à l'avance une position EXACTE valide
  // (TextSelection.near cherche la plus proche position de curseur
  // valide à partir d'une position candidate, cf. son usage plus bas).
  let TextSelectionClass = null;

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
        // `format` : { type:'number', style, decimals, currency, words } ou
        // { type:'date', preset } - choisi via la barre flottante (cf.
        // wireVariableFloatingToolbar), `null` tant que l'utilisateur n'a
        // rien réglé (comportement historique, String(val) brut).
        return { table: noBareRender, column: noBareRender, key: noBareRender, format: noBareRender };
      },
      parseHTML() {
        return [{
          tag: 'span.var-badge',
          getAttrs: el => {
            let format = null;
            const raw = el.getAttribute('data-format');
            if (raw) { try { format = JSON.parse(raw); } catch (e) { format = null; } }
            return { table: el.getAttribute('data-table'), column: el.getAttribute('data-column'), key: el.getAttribute('data-key'), format };
          },
        }];
      },
      renderHTML({ HTMLAttributes, node }) {
        const attrs = mergeAttributes(HTMLAttributes, {
          class: 'var-badge', contenteditable: 'false',
          'data-table': node.attrs.table, 'data-column': node.attrs.column, 'data-key': node.attrs.key,
        });
        if (node.attrs.format) attrs['data-format'] = JSON.stringify(node.attrs.format);
        return ['span', attrs, '#' + node.attrs.key];
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

  // Couleur de police / surlignage - même schéma exact que FontSize
  // ci-dessus (une extension par attribut, toutes deux augmentant la marque
  // 'textStyle') : rien de spécifique aux tableaux/2-colonnes à écrire, une
  // marque s'applique au texte où qu'il vive dans le schéma - lue par
  // pdf-export.js au même endroit générique que gras/italique/souligné/
  // taille/police (inheritedStyle), donc déjà correcte partout où ce
  // dernier est déjà appelé (flux principal, cellule de tableau, colonne).
  function createTextColorExtension(Extension) {
    return Extension.create({
      name: 'textColor',
      addGlobalAttributes() {
        return [{
          types: ['textStyle'],
          attributes: {
            color: {
              default: null,
              parseHTML: el => el.style.color || null,
              renderHTML: attrs => (attrs.color ? { style: `color: ${attrs.color}` } : {}),
            },
          },
        }];
      },
      addCommands() {
        return {
          setTextColor: color => ({ chain }) => chain().setMark('textStyle', { color }).run(),
          unsetTextColor: () => ({ chain }) => chain().setMark('textStyle', { color: null }).run(),
        };
      },
    });
  }
  function createHighlightExtension(Extension) {
    return Extension.create({
      name: 'highlightColor',
      addGlobalAttributes() {
        return [{
          types: ['textStyle'],
          attributes: {
            backgroundColor: {
              default: null,
              parseHTML: el => el.style.backgroundColor || null,
              renderHTML: attrs => (attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {}),
            },
          },
        }];
      },
      addCommands() {
        return {
          setHighlight: backgroundColor => ({ chain }) => chain().setMark('textStyle', { backgroundColor }).run(),
          unsetHighlight: () => ({ chain }) => chain().setMark('textStyle', { backgroundColor: null }).run(),
        };
      },
    });
  }

  // Style de puce (disque/cercle/carré) - même schéma que FontSize/TextColor
  // ci-dessus, mais augmente 'bulletList' (le nœud officiel de StarterKit,
  // jamais remplacé) plutôt que 'textStyle' : pas besoin d'importer/épingler
  // un package @tiptap/extension-bullet-list séparé juste pour un attribut.
  // `updateAttributes('bulletList', ...)` est une commande CORE de TipTap,
  // pas besoin d'en déclarer une dédiée ici (cf. wireToolbar).
  function createBulletStyleExtension(Extension) {
    return Extension.create({
      name: 'bulletStyle',
      addGlobalAttributes() {
        return [{
          types: ['bulletList'],
          attributes: {
            bulletStyle: {
              default: 'disc',
              parseHTML: el => el.getAttribute('data-bullet-style') || 'disc',
              renderHTML: attrs => (attrs.bulletStyle && attrs.bulletStyle !== 'disc' ? { 'data-bullet-style': attrs.bulletStyle } : {}),
            },
          },
        }];
      },
    });
  }

  // Fond de cellule (remplir) - augmente TableCell/TableHeader (extensions
  // officielles) du même `backgroundColor` que le surlignage de texte
  // ci-dessus, MÊME NOM d'attribut/style CSS que par coïncidence utile (pas
  // de lien réel entre les deux, une cellule et une marque de texte sont des
  // choses différentes) : lu par pdf-export.js à l'endroit dédié aux
  // cellules (tableFrom), pas via inheritedStyle (une cellule n'est pas un
  // run de texte).
  function withCellBackground(CellExtension) {
    return CellExtension.extend({
      addAttributes() {
        return Object.assign({}, this.parent(), {
          backgroundColor: {
            default: null,
            parseHTML: el => el.style.backgroundColor || null,
            renderHTML: attrs => (attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {}),
          },
        });
      },
    });
  }
  // Applique à TOUTES les cellules touchées par la sélection - un simple
  // curseur dans une cellule (editor.commands.updateAttributes suffit) ou
  // une vraie sélection de plusieurs cellules (CellSelection de
  // prosemirror-tables, reconnue par duck-typing sur `forEachCell` plutôt
  // que d'importer le type rien que pour un instanceof - évite une
  // dépendance supplémentaire pour une simple vérification de forme).
  function setCellsBackground(nodeEditor, color) {
    const { state, view } = nodeEditor;
    const { selection } = state;
    if (typeof selection.forEachCell === 'function') {
      const tr = state.tr;
      selection.forEachCell((cell, pos) => {
        tr.setNodeMarkup(pos, undefined, Object.assign({}, cell.attrs, { backgroundColor: color }));
      });
      view.dispatch(tr);
      return;
    }
    nodeEditor.chain().updateAttributes('tableCell', { backgroundColor: color }).updateAttributes('tableHeader', { backgroundColor: color }).run();
  }

  // Zone 2 colonnes — pas d'extension officielle équivalente à
  // extension-table ; construite comme une paire de nœuds suivant le même
  // principe d'imbrication (une colonne accepte du contenu riche directement
  // dans le schéma). Mêmes noms de classe que la V1
  // (.two-columns-zone/.two-columns-column) pour limiter l'adaptation de
  // pdf-export.js. `isolating: true` sur les deux nœuds : empêche
  // backspace/suppr en bord de colonne de fusionner la zone avec le
  // paragraphe voisin (comportement par défaut de ProseMirror sans ça,
  // vérifié en conditions réelles).
  // Tab/Shift-Tab personnalisés : AVANT toute autre chose, préserve le
  // comportement natif d'indentation de liste (sinkListItem/liftListItem) -
  // sans ce court-circuit explicite, l'extension Table (dont le propre
  // Tab/Shift-Tab - goToNextCell/goToPreviousCell - l'emporte en pratique
  // sur celui de StarterKit pour une liste nichée dans une cellule, vérifié
  // en conditions réelles, l'ordre exact de préséance entre extensions pour
  // une MÊME touche n'étant pas fiable à deviner) changeait de cellule au
  // lieu d'indenter/désindenter, signalé cassé par l'utilisateur. Hors
  // liste, Tab/Shift-Tab dans une colonne de zone 2-colonnes (aucun
  // comportement par défaut avant ce correctif - signalé cassé, "il ne se
  // passe rien") déplace le curseur d'une colonne à l'autre, ou en sort
  // (paragraphe suivant/précédent la zone - nouveau paragraphe vide créé en
  // sortie avant s'il n'y en a pas déjà un ; en sortie arrière, sans effet
  // s'il n'y a rien avant). Enregistrée en DERNIER dans `extensions` (cf.
  // init()) : conditionne empiriquement quelle extension gagne la main sur
  // une touche partagée.
  // Résout la zone/colonne englobant `$from`, si applicable - factorisé
  // entre Tab et Shift-Tab (même détection, direction de navigation
  // opposée seulement).
  function findTwoColumnsContext($from) {
    let columnDepth = -1;
    for (let d = $from.depth; d > 0; d -= 1) {
      if ($from.node(d).type.name === 'twoColumnsColumn') { columnDepth = d; break; }
    }
    if (columnDepth === -1) return null;
    const zoneDepth = columnDepth - 1;
    if (zoneDepth < 1 || $from.node(zoneDepth).type.name !== 'twoColumnsZone') return null;
    return { columnDepth, zoneDepth, colIndex: $from.index(zoneDepth) };
  }
  function createTabNavigationExtension(Extension) {
    return Extension.create({
      name: 'tabNavigation',
      addKeyboardShortcuts() {
        return {
          Tab: ({ editor: ed }) => {
            if (ed.isActive('listItem')) {
              // Résultat (succès ou non - ex. premier item sans rien
              // au-dessus où s'imbriquer) toujours consommé : un échec de
              // sink doit rester SANS EFFET, pas retomber sur un
              // changement de cellule/colonne à la place.
              ed.commands.sinkListItem('listItem');
              return true;
            }
            const { $from } = ed.state.selection;
            const ctx = findTwoColumnsContext($from);
            if (!ctx) return false;
            const { columnDepth, zoneDepth, colIndex } = ctx;
            if (colIndex === 0) {
              const afterLeftCol = $from.after(columnDepth);
              const target = ed.state.doc.resolve(Math.min(afterLeftCol + 1, ed.state.doc.content.size));
              ed.chain().focus().setTextSelection(TextSelectionClass.near(target, 1)).run();
              return true;
            }
            const afterZone = $from.after(zoneDepth);
            if (afterZone >= ed.state.doc.content.size) {
              ed.chain().focus().insertContentAt(afterZone, { type: 'paragraph' }).setTextSelection(afterZone + 1).run();
              return true;
            }
            ed.chain().focus().setTextSelection(TextSelectionClass.near(ed.state.doc.resolve(afterZone), 1)).run();
            return true;
          },
          'Shift-Tab': ({ editor: ed }) => {
            if (ed.isActive('listItem')) {
              // Même logique de consommation systématique que Tab ci-dessus
              // (un lift déjà au premier niveau reste sans effet, ne retombe
              // jamais sur un changement de cellule/colonne).
              ed.commands.liftListItem('listItem');
              return true;
            }
            const { $from } = ed.state.selection;
            const ctx = findTwoColumnsContext($from);
            if (!ctx) return false;
            const { columnDepth, zoneDepth, colIndex } = ctx;
            if (colIndex === 1) {
              const beforeRightCol = $from.before(columnDepth);
              const target = ed.state.doc.resolve(Math.max(beforeRightCol - 1, 0));
              ed.chain().focus().setTextSelection(TextSelectionClass.near(target, -1)).run();
              return true;
            }
            const beforeZone = $from.before(zoneDepth);
            if (beforeZone <= 0) return true; // rien avant la zone - sans effet
            ed.chain().focus().setTextSelection(TextSelectionClass.near(ed.state.doc.resolve(beforeZone - 1), -1)).run();
            return true;
          },
        };
      },
    });
  }

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
      addAttributes() {
        return {
          // Pourcentage de largeur de la colonne GAUCHE (grille CSS, cf.
          // css/editor-v2.css), clampé 20-80 au glisser de la poignée -
          // même borne que la V1 (js/editor.js). Sérialisé en variable CSS
          // `--layout-left` sur le nœud lui-même (comme la V1), pas en
          // attribut HTML bare - lu par pdf-export.js indirectement (il
          // mesure la géométrie RENDUE des colonnes, jamais cette variable
          // par son nom, cf. twoColumnsFrom).
          layoutLeft: {
            default: 50,
            parseHTML: el => { const v = parseFloat(el.style.getPropertyValue('--layout-left')); return Number.isFinite(v) ? v : 50; },
            renderHTML: () => ({}),
          },
        };
      },
      parseHTML() { return [{ tag: 'div.two-columns-zone' }]; },
      renderHTML({ HTMLAttributes, node }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'two-columns-zone', style: `--layout-left: ${node.attrs.layoutLeft || 50}%` }), 0];
      },
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
      // NodeView : le schéma (content: 'twoColumnsColumn twoColumnsColumn')
      // n'autorise pas un enfant DOM supplémentaire hors contentDOM
      // autrement - `dom` est donc un wrapper EXTERNE (position:relative,
      // pour ancrer la poignée en absolu) englobant `contentDOM` (les deux
      // colonnes, gérées par ProseMirror, avec la classe/grille réelle
      // .two-columns-zone) et la poignée elle-même, en enfant du wrapper
      // mais PAS de contentDOM - la laisser en dehors du contenu géré par
      // ProseMirror évite tout risque qu'une reconciliation future la
      // retire en la traitant comme un enfant inattendu. --layout-left posé
      // sur le WRAPPER (pas sur contentDOM) : une variable CSS personnalisée
      // hérite vers le BAS uniquement - posée sur contentDOM, la poignée
      // (sa sœur, pas sa descendante) ne la verrait jamais.
      addNodeView() {
        return ({ node, editor: nodeEditor, getPos }) => {
          const wrap = document.createElement('div');
          wrap.className = 'two-columns-zone-outer';
          const contentDOM = document.createElement('div');
          contentDOM.className = 'two-columns-zone';
          wrap.appendChild(contentDOM);
          const grip = document.createElement('div');
          grip.className = 'two-columns-resize-grip';
          grip.title = 'Redimensionner les colonnes';
          wrap.appendChild(grip);

          const applyLayout = attrs => wrap.style.setProperty('--layout-left', (attrs.layoutLeft || 50) + '%');
          applyLayout(node.attrs);

          let dragging = false;
          function onMove(event) {
            const rect = wrap.getBoundingClientRect();
            if (!rect.width) return;
            const left = ((event.clientX - rect.left) / rect.width) * 100;
            wrap.style.setProperty('--layout-left', Math.max(20, Math.min(80, left)) + '%');
          }
          function onUp() {
            dragging = false;
            document.removeEventListener('mousemove', onMove);
            const finalLeft = Math.round(parseFloat(wrap.style.getPropertyValue('--layout-left')) || 50);
            const pos = getPos();
            if (typeof pos !== 'number') return;
            const { state, view } = nodeEditor;
            const current = state.doc.nodeAt(pos);
            if (!current) return;
            view.dispatch(state.tr.setNodeMarkup(pos, undefined, Object.assign({}, current.attrs, { layoutLeft: finalLeft })));
          }
          grip.addEventListener('mousedown', event => {
            event.preventDefault(); event.stopPropagation();
            dragging = true;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp, { once: true });
          });

          return {
            dom: wrap,
            contentDOM,
            update: updatedNode => {
              if (updatedNode.type.name !== 'twoColumnsZone') return false;
              if (!dragging) applyLayout(updatedNode.attrs);
              return true;
            },
            destroy: () => document.removeEventListener('mousemove', onMove),
            // Sans ça, ProseMirror surveille via MutationObserver le DOM de
            // CE NodeView et considère toute mutation qu'IL n'a pas
            // lui-même provoquée (ici : `wrap.style.setProperty(...)` dans
            // onMove, en dehors de toute transaction) comme "inattendue" -
            // il tente alors de "réparer" la vue en RECRÉANT le NodeView.
            // Constaté précisément : `getPos()` valait un nombre correct au
            // mousedown, mais `wrap`/`contentDOM` étaient déjà DÉTACHÉS du
            // document (`isConnected: false`) au moment du mouseup, quelques
            // dizaines de ms plus tard - le glisser semblait fonctionner
            // (la poignée bougeait bien à l'écran) mais le commit final sur
            // relâchement de la souris s'appliquait à un nœud fantôme,
            // jamais reporté sur le document réel (signalé par
            // l'utilisateur : "la poignée ne fonctionne pas"). Cette
            // NodeView gère elle-même toutes les mutations de son propre
            // `dom` (le style CSS pendant le glisser) - dire à ProseMirror
            // de les ignorer TOUTES est donc correct ici, pas une échappatoire.
            ignoreMutation: () => true,
          };
        };
      },
    });
    return { TwoColumnsColumn, TwoColumnsZone };
  }

  // Image — nœud "atome" en ligne. Parité V1 (js/editor.js:ImageBlot) pour les
  // attributs de mise en forme : `layer` (normal/devant/derrière le texte,
  // via position:absolute + left/top/z-index), `opacity`, `align` (gauche/
  // centre/droite, uniquement en flux normal), `wrap` (en ligne/bloc).
  // Contrairement à VarBadge, chaque attribut garde `renderHTML: () => ({})`
  // (pas de rendu bare) : le nœud construit lui-même la chaîne `style`
  // complète dans son propre renderHTML() ci-dessous plutôt que de compter
  // sur le comportement de fusion par défaut de plusieurs attributs qui
  // écriraient chacun dans `style` indépendamment.
  function createEditorImageNode(Node) {
    const noBareRender = () => ({});
    function styleFor(a) {
      const parts = [];
      if (a.width) parts.push(`width: ${a.width}`);
      if (a.layer !== 'normal') {
        parts.push('position: absolute', `left: ${a.left || 0}px`, `top: ${a.top || 0}px`, `z-index: ${a.layer === 'front' ? 5 : -1}`);
      }
      if (a.opacity !== 1 && a.opacity != null) parts.push(`opacity: ${a.opacity}`);
      return parts.join('; ');
    }
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
          width: { default: '320px', parseHTML: el => el.style.width || null, renderHTML: noBareRender },
          layer: { default: 'normal', parseHTML: el => el.getAttribute('data-layer') || 'normal', renderHTML: noBareRender },
          left: { default: null, parseHTML: el => (el.style.left ? parseFloat(el.style.left) : null), renderHTML: noBareRender },
          top: { default: null, parseHTML: el => (el.style.top ? parseFloat(el.style.top) : null), renderHTML: noBareRender },
          opacity: { default: 1, parseHTML: el => (el.style.opacity !== '' ? parseFloat(el.style.opacity) : 1), renderHTML: noBareRender },
          align: { default: null, parseHTML: el => el.getAttribute('data-align') || null, renderHTML: noBareRender },
          wrap: { default: 'inline', parseHTML: el => el.getAttribute('data-wrap') || 'inline', renderHTML: noBareRender },
        };
      },
      parseHTML() { return [{ tag: 'img.editor-image' }]; },
      renderHTML({ node }) {
        const a = node.attrs;
        const attrs = { class: 'editor-image', draggable: 'false', src: a.src, alt: a.alt, style: styleFor(a), 'data-layer': a.layer, 'data-wrap': a.wrap };
        if (a.align) attrs['data-align'] = a.align;
        return ['img', attrs];
      },
      addCommands() {
        return { insertImage: attrs => ({ chain }) => chain().insertContent({ type: this.name, attrs }).run() };
      },
      // NodeView plutôt que les overlays document.body de la V1 (cf. mémoire
      // project_quill_mutation_observer) : les poignées de redimensionnement/
      // déplacement sont de vrais enfants DOM du wrapper, positionnés en pur
      // CSS - pas besoin de recalculer leur position en JS à chaque scroll/
      // resize comme le faisait la V1.
      addNodeView() {
        return ({ node, editor: nodeEditor, getPos }) => {
          const wrap = document.createElement('span');
          wrap.className = 'editor-image-view';
          const img = document.createElement('img');
          img.className = 'editor-image';
          img.draggable = false;
          wrap.appendChild(img);

          const moveHandle = document.createElement('span');
          moveHandle.className = 'editor-image-move-handle';
          moveHandle.title = 'Déplacer';
          wrap.appendChild(moveHandle);
          ['nw', 'ne', 'sw', 'se'].forEach(corner => {
            const h = document.createElement('span');
            h.className = 'editor-image-handle editor-image-handle-' + corner;
            wrap.appendChild(h);
            h.addEventListener('mousedown', event => startResize(event, corner));
          });
          moveHandle.addEventListener('mousedown', startMove);
          // Une fois l'image DÉJÀ sélectionnée (2e interaction), permet de la
          // glisser directement au clic sur l'image elle-même, sans devoir
          // viser précisément la poignée de déplacement (petite bulle) - cf.
          // retour utilisateur : difficile de la déplacer sans cliquer
          // spécifiquement sur la bulle, qui n'est là que pour amorcer la
          // toute première sélection (indispensable pour une image "derrière
          // le texte" couverte par du texte, cf. commentaire CSS sur
          // .editor-image-move-handle - la poignée reste inchangée, toujours
          // affichée pour ce cas). Le TOUT PREMIER clic (pas encore
          // sélectionnée) continue de suivre le chemin normal de ProseMirror
          // (sélection du nœud) - ne déclenche PAS de déplacement immédiat,
          // qui surprendrait sur un simple clic de sélection.
          img.addEventListener('mousedown', event => {
            if (!wrap.classList.contains('editor-image-layered')) return;
            if (!wrap.classList.contains('editor-image-selected')) return;
            startMove(event);
          });

          // NodeView vivante : structure DIFFÉRENTE du HTML sérialisé
          // (renderHTML ci-dessus, qui pose position/left/top/z-index
          // directement sur l'<img>, forme lue par pdf-export.js/reader-
          // mode.js) - ici le positionnement en calque est porté par le
          // <span> wrapper (position:relative en permanence, pour que les
          // poignées s'y ancrent par un simple CSS absolu). Le z-index NÉGATIF
          // ("derrière le texte") est en revanche posé sur l'<img> SEULE, pas
          // sur le wrapper : un enfant positionné SANS z-index propre ne crée
          // PAS son propre contexte d'empilement, donc la poignée de
          // déplacement (z-index positif, cf. CSS) reste comparée directement
          // aux autres enfants de .tiptap et peut passer AU-DESSUS du texte
          // même quand l'image elle-même passe dessous - sans quoi, avec le
          // z-index négatif posé sur le wrapper, TOUT son contenu (poignée
          // comprise) serait entraîné derrière le texte avec elle, la rendant
          // impossible à re-sélectionner une fois cachée (vérifié en
          // conditions réelles). Même précédent que le .tableWrapper de
          // prosemirror-tables : un artefact d'édition en direct, absent de
          // la sérialisation (cf. mémoire project_v2_tiptap_migration).
          function applyAttrs(attrs) {
            img.src = attrs.src || '';
            img.alt = attrs.alt || '';
            const imgStyle = [];
            if (attrs.width) imgStyle.push(`width: ${attrs.width}`);
            if (attrs.opacity !== 1 && attrs.opacity != null) imgStyle.push(`opacity: ${attrs.opacity}`);
            if (attrs.layer !== 'normal') imgStyle.push('position: relative', `z-index: ${attrs.layer === 'front' ? 5 : -1}`);
            img.setAttribute('style', imgStyle.join('; '));
            const layered = attrs.layer !== 'normal';
            wrap.classList.toggle('editor-image-layered', layered);
            if (layered) {
              wrap.style.position = 'absolute';
              wrap.style.left = (attrs.left || 0) + 'px';
              wrap.style.top = (attrs.top || 0) + 'px';
              // Largeur EXPLICITE (pas de "shrink-to-fit" implicite, le
              // comportement par défaut d'un position:absolute sans largeur
              // posée) : dans une cellule de tableau (bloc englobant CSS
              // étroit, cf. pdf-export.js/attributeNestedPendingImages), un
              // glisser qui approche/dépasse la largeur de CE bloc englobant
              // (pas besoin d'un glisser extrême - une cellule fait souvent
              // deux/trois cents pixels) fait s'effondrer la largeur calculée
              // en mode shrink-to-fit à 0 (vérifié en conditions réelles :
              // l'image entière, poignées comprises, devient un rectangle
              // 0×0 - donc invisible - alors que `left`/`top` restent des
              // nombres parfaitement valides) : l'image "disparaît dans le
              // vide" en sortant du tableau plutôt que de simplement en
              // sortir visuellement, signalé cassé par l'utilisateur. Poser
              // ici la même largeur que l'<img> lui-même retire toute
              // dépendance à ce calcul de largeur implicite.
              wrap.style.width = attrs.width || '';
            } else {
              wrap.style.position = ''; wrap.style.left = ''; wrap.style.top = ''; wrap.style.width = '';
            }
            moveHandle.style.display = layered ? '' : 'none';
            if (attrs.align) wrap.setAttribute('data-align', attrs.align); else wrap.removeAttribute('data-align');
            wrap.setAttribute('data-wrap', attrs.wrap || 'inline');
          }
          applyAttrs(node.attrs);

          function updateAttrs(patch) {
            const pos = getPos();
            if (typeof pos !== 'number') return;
            const { state, view } = nodeEditor;
            const current = state.doc.nodeAt(pos);
            if (!current) return;
            const tr = state.tr.setNodeMarkup(pos, undefined, Object.assign({}, current.attrs, patch));
            // Restaure explicitement la NodeSelection sur le nœud de
            // remplacement - cf. commentaire sur NodeSelectionClass en tête
            // de fichier. Le retour visuel de sélection (classe CSS) n'est
            // PAS géré ici, ni via selectNode/deselectNode de la NodeView
            // (constaté peu fiable après un setNodeMarkup en conditions
            // réelles - remplace le nœud, et ProseMirror n'appelle alors pas
            // systématiquement ces callbacks sur l'instance résultante, dans
            // AUCUN des deux sens - ni pour l'ajouter, ni pour la retirer) :
            // centralisé dans wireImageFloatingToolbar.check(), qui recalcule
            // l'état à chaque sélection/transaction depuis une source fiable
            // (editor.isActive('editorImage')) plutôt que de dépendre du
            // cycle de vie par-NodeView.
            if (NodeSelectionClass) tr.setSelection(NodeSelectionClass.create(tr.doc, pos));
            view.dispatch(tr);
          }

          let resizeState = null;
          function startResize(event, corner) {
            event.preventDefault(); event.stopPropagation();
            const rect = img.getBoundingClientRect();
            resizeState = { startX: event.clientX, startWidth: rect.width, sign: corner.includes('w') ? -1 : 1 };
            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeUp, { once: true });
          }
          function onResizeMove(event) {
            if (!resizeState) return;
            const width = Math.max(30, resizeState.startWidth + (event.clientX - resizeState.startX) * resizeState.sign);
            img.style.width = Math.round(width) + 'px';
          }
          function onResizeUp() {
            document.removeEventListener('mousemove', onResizeMove);
            if (resizeState) updateAttrs({ width: Math.round(img.getBoundingClientRect().width) + 'px' });
            resizeState = null;
          }

          let moveState = null;
          function startMove(event) {
            event.preventDefault(); event.stopPropagation();
            // Lit les attributs COURANTS via getPos()/nodeAt (pas la variable
            // `node` capturée à la création de la NodeView) : cette dernière
            // ne se met jamais à jour toute seule après le premier rendu -
            // seul `update(updatedNode)` reçoit le nœud frais à chaque
            // transaction - donc `node.attrs.left` resterait bloqué sur sa
            // valeur d'origine (souvent `null`) après un premier déplacement,
            // faussant le point de départ du déplacement suivant.
            const pos = getPos();
            const current = (typeof pos === 'number' && nodeEditor.state.doc.nodeAt(pos)) || node;
            moveState = { startX: event.clientX, startY: event.clientY, startLeft: current.attrs.left || 0, startTop: current.attrs.top || 0 };
            document.addEventListener('mousemove', onMoveMove);
            document.addEventListener('mouseup', onMoveUp, { once: true });
          }
          function onMoveMove(event) {
            if (!moveState) return;
            wrap.style.left = (moveState.startLeft + (event.clientX - moveState.startX)) + 'px';
            wrap.style.top = (moveState.startTop + (event.clientY - moveState.startY)) + 'px';
          }
          function onMoveUp(event) {
            document.removeEventListener('mousemove', onMoveMove);
            if (moveState) {
              updateAttrs({
                left: Math.round(moveState.startLeft + (event.clientX - moveState.startX)),
                top: Math.round(moveState.startTop + (event.clientY - moveState.startY)),
              });
            }
            moveState = null;
          }

          return {
            dom: wrap,
            update: updatedNode => {
              if (updatedNode.type.name !== 'editorImage') return false;
              applyAttrs(updatedNode.attrs);
              return true;
            },
            selectNode: () => wrap.classList.add('editor-image-selected'),
            deselectNode: () => wrap.classList.remove('editor-image-selected'),
            destroy: () => {
              document.removeEventListener('mousemove', onResizeMove);
              document.removeEventListener('mousemove', onMoveMove);
            },
          };
        };
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
  // Largeur réellement disponible pour un enfant direct de la racine
  // ProseMirror (.tiptap) - son clientWidth inclut SON PROPRE padding (utile
  // pour simuler la marge de page en Aperçu A4, cf. css/editor-v2.css), qui
  // n'est pas disponible à un enfant. Partagé entre clampOverflowingTables
  // (tableaux) et l'alignement des images en calque (snap gauche/centre/
  // droite), même calcul dans les deux cas.
  function editorContentWidthPx(currentEditor) {
    const rootEl = currentEditor.view.dom;
    const rootCs = getComputedStyle(rootEl);
    return rootEl.clientWidth - (parseFloat(rootCs.paddingLeft) || 0) - (parseFloat(rootCs.paddingRight) || 0);
  }

  // Tant qu'UNE SEULE colonne d'un tableau reste "auto" (pas de `colwidth`
  // propre), `<table>` lui-même ne porte qu'un `min-width` (jamais un
  // `width` exact) - `.tiptap table { width: 100% }` (css/editor-v2.css)
  // s'applique donc TOUJOURS tel quel, quelle que soit la largeur demandée
  // pour une colonne explicitement redimensionnée : agrandir une colonne ne
  // fait alors que voler de la place aux colonnes "auto" voisines, le
  // tableau entier restant coincé à 100% du conteneur - la poignée extérieure
  // droite (qui n'a PAS de colonne voisine à qui prendre de la place de
  // l'autre côté) ne peut alors jamais faire grandir le tableau du tout,
  // signalé cassé par l'utilisateur ("redimensionne les autres mais ne bouge
  // pas"). Dès que TOUTES les colonnes ont un `colwidth` explicite en
  // revanche, `<table>` porte un `width` exact (constaté en conditions
  // réelles) qui l'affranchit du `width:100%` - le tableau peut alors
  // dépasser 100% (jusqu'à ce que clampOverflowingTables le retienne dans la
  // page). Fixé en gelant, dès le premier redimensionnement d'UNE colonne
  // d'un tableau, la largeur RENDUE actuelle de chaque colonne encore "auto"
  // du même tableau comme son propre `colwidth` explicite - même mécanisme
  // (tourne sur chaque mise à jour, une seule colonne de référence -
  // première ligne - pour la détection) que clampOverflowingTables ci-
  // dessous, appelé juste après pour rattraper un éventuel dépassement.
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
  function clampOverflowingTables(currentEditor) {
    const editorContainer = document.getElementById('editor-container');
    if (!editorContainer || !editorContainer.classList.contains('a4-preview')) return;
    const containerWidth = editorContentWidthPx(currentEditor);
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
  function createFloatingPanel(className, innerHTML, onAction, onInput) {
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
    // Un <input type=range> (curseur d'opacité de la toolbar image) a besoin
    // de son évènement 'input' propre - un simple mousedown suffit aux
    // boutons mais volerait la valeur en cours de glissement du curseur.
    // `[data-role]` (pas `input[data-role]`) : un <select>/<input type=text>
    // (barre de formatage nombre/date, cf. wireVariableFloatingToolbar) émet
    // aussi 'input' - restreindre au tag <input> les excluait silencieusement.
    if (onInput) el.addEventListener('input', (event) => {
      const input = event.target.closest('[data-role]');
      if (input) onInput(input.dataset.role, input.value);
    });
    document.body.appendChild(el);
    let stopAutoUpdate = null;
    return {
      el,
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

  // Palettes courtes, sobres (inspirées des standards actuels - Google Docs/
  // Notion) : couleurs de police plus saturées (lisibles en texte fin),
  // couleurs de surlignage/fond de cellule en teintes pastel (le texte
  // au-dessus reste lisible).
  const TEXT_COLOR_PRESETS = ['#000000', '#5f6368', '#c0392b', '#d68910', '#8a7000', '#1e8449', '#2874a6', '#7d3c98'];
  const FILL_COLOR_PRESETS = ['#fff2a8', '#c8f7c5', '#c8e6ff', '#ffd6d6', '#e6d6ff', '#ffe0b3', '#e0e0e0'];

  // Un seul menu déroulant à la fois (couleur/police/taille) - fermé par un
  // clic n'importe où ailleurs (hors du bouton qui l'a ouvert ou du panneau
  // lui-même). Générisé (initialement couleur seulement) pour la maquette
  // "Toolbar compacte" - police/taille rejoignent le même mécanisme plutôt
  // que d'en dupliquer un second.
  let openDropdownPanel = null;
  document.addEventListener('mousedown', (event) => {
    if (!openDropdownPanel) return;
    if (event.target.closest('.v2-color-dropdown') || event.target.closest('.v2-color-split')
      || event.target.closest('.v2-format-panel') || event.target.closest('.v2-format-chip')
      || event.target.closest('.v2-stepper')) return;
    openDropdownPanel.hide();
    openDropdownPanel = null;
  });

  // Menu déroulant de couleur générique (grille de nuances + case
  // "personnalisé" ouvrant le sélecteur natif + case "aucune", optionnelle) -
  // même esprit que la toolbar de tableau/image (createFloatingPanel), pour
  // le bouton de police/surlignage de la toolbar principale ET le bouton de
  // fond de cellule de la toolbar de tableau. `onPick(chain, color)`/
  // `onNone(chain)` reçoivent une chaîne TipTap déjà focus+sélection
  // restaurée (cf. `withSavedSelection` de chaque appelant) - à eux
  // d'appeler la commande adéquate dessus, sans jamais lancer .run() (fait
  // par l'appelant, une seule fois).
  function createColorDropdown(presets, { noneLabel, onPick, onNone, withSavedSelection }) {
    const swatches = presets.map(c => `<button data-action="pick:${c}" style="background:${c}" title="${c}"></button>`).join('');
    const html = '<div class="v2-color-grid">' + swatches + '</div>'
      + '<div class="v2-color-dropdown-footer">'
      + `<button data-action="custom" title="Couleur personnalisée">${Icons.svg('fill')}<span>Personnalisé…</span></button>`
      + (onNone ? `<button data-action="none" title="${noneLabel}">${Icons.svg('noColor')}<span>${noneLabel}</span></button>` : '')
      + '</div>'
      + '<input type="color" class="v2-color-dropdown-native">';
    const panel = createFloatingPanel('v2-color-dropdown', html, (action) => {
      if (action === 'custom') { panel.el.querySelector('.v2-color-dropdown-native').click(); return; }
      if (action === 'none') { withSavedSelection(chain => onNone(chain)); closeDropdownPanel(); return; }
      if (action.indexOf('pick:') === 0) { const color = action.slice(5); withSavedSelection(chain => onPick(chain, color)); closeDropdownPanel(); }
    });
    panel.el.querySelector('.v2-color-dropdown-native').addEventListener('input', (event) => {
      withSavedSelection(chain => onPick(chain, event.target.value));
      closeDropdownPanel();
    });
    return panel;
  }
  function closeDropdownPanel() { if (openDropdownPanel) { openDropdownPanel.hide(); openDropdownPanel = null; } }
  // Ouvre/ferme `panel` au clic sur `btn` - mousedown+preventDefault (pas
  // click) : même raison que la toolbar de tableau/image, éviter de perdre
  // la sélection ProseMirror avant que le panneau ne s'ouvre. `getSelection`
  // capture la sélection AU MOMENT du clic (avant que le panneau ne vole le
  // focus) - restaurée par `withSavedSelection` quand une couleur est
  // effectivement choisie, potentiellement bien après ce clic initial.
  function wireDropdownButton(btn, panel, captureSelection) {
    if (!btn) return;
    btn.addEventListener('mousedown', (event) => {
      event.preventDefault();
      captureSelection();
      if (openDropdownPanel === panel) { closeDropdownPanel(); return; }
      closeDropdownPanel();
      panel.show(btn);
      openDropdownPanel = panel;
    });
  }
  function setColorBar(id, color) {
    const el = document.getElementById(id);
    if (el) el.style.background = color || 'transparent';
  }

  // Couleur de police / surlignage (bandeau principal) - bouton + pastille
  // (couleur courante) + menu déroulant, plutôt que le <input type=color> +
  // bouton "retirer" séparés d'origine (signalé peu sobre/pas assez
  // standard par l'utilisateur).
  function wireColorPickers() {
    let savedSelection = null;
    const captureSelection = () => { const { from, to } = editor.state.selection; savedSelection = { from, to }; };
    const withSavedSelection = (fn) => {
      const chain = editor.chain().focus();
      if (savedSelection) chain.setTextSelection(savedSelection);
      fn(chain);
      chain.run();
    };
    const textColorPanel = createColorDropdown(TEXT_COLOR_PRESETS, {
      noneLabel: 'Par défaut',
      withSavedSelection,
      onPick: (chain, color) => { chain.setTextColor(color); setColorBar('v2-color-text-bar', color); },
      onNone: (chain) => { chain.unsetTextColor(); setColorBar('v2-color-text-bar', null); },
    });
    wireDropdownButton(document.getElementById('v2-btn-text-color'), textColorPanel, captureSelection);
    const highlightPanel = createColorDropdown(FILL_COLOR_PRESETS, {
      noneLabel: 'Aucun',
      withSavedSelection,
      onPick: (chain, color) => { chain.setHighlight(color); setColorBar('v2-color-highlight-bar', color); },
      onNone: (chain) => { chain.unsetHighlight(); setColorBar('v2-color-highlight-bar', null); },
    });
    wireDropdownButton(document.getElementById('v2-btn-highlight'), highlightPanel, captureSelection);
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
      `<button data-action="${action}" title="${title}">${Icons.svg(icon)}</button>`).join('')
      + '<span class="v2-floating-sep"></span>'
      + '<button data-action="fill-open" class="v2-color-split" id="v2-table-fill-btn" title="Fond de cellule (remplir)">'
      + Icons.svg('fill') + '<span class="v2-color-split-bar" id="v2-table-fill-bar"></span>' + Icons.svg('caretDown')
      + '</button>';
    const panel = createFloatingPanel('v2-floating-toolbar', html, (action) => {
      const commands = {
        'row-before': () => editor.chain().focus().addRowBefore().run(),
        'row-after': () => editor.chain().focus().addRowAfter().run(),
        'row-del': () => editor.chain().focus().deleteRow().run(),
        'col-before': () => editor.chain().focus().addColumnBefore().run(),
        'col-after': () => editor.chain().focus().addColumnAfter().run(),
        'col-del': () => editor.chain().focus().deleteColumn().run(),
        'table-del': () => editor.chain().focus().deleteTable().run(),
        'fill-open': () => {
          const btn = document.getElementById('v2-table-fill-btn');
          if (openDropdownPanel === fillPanel) { closeDropdownPanel(); return; }
          closeDropdownPanel();
          fillPanel.show(btn);
          openDropdownPanel = fillPanel;
        },
      };
      (commands[action] || (() => {}))();
    });
    // Pas de sélection à restaurer ici (contrairement au texte) :
    // setCellsBackground lit `editor.state.selection` directement, qui
    // persiste indépendamment du focus DOM - `withSavedSelection` n'est
    // donc qu'un simple passe-plat (le paramètre `chain` de
    // createColorDropdown ne sert à rien pour une cellule).
    const fillPanel = createColorDropdown(FILL_COLOR_PRESETS, {
      noneLabel: 'Aucun',
      withSavedSelection: fn => fn(null),
      onPick: (chain, color) => { setCellsBackground(editor, color); setColorBar('v2-table-fill-bar', color); },
      onNone: () => { setCellsBackground(editor, null); setColorBar('v2-table-fill-bar', null); },
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
      const cellAttrs = editor.getAttributes('tableCell').backgroundColor ? editor.getAttributes('tableCell') : editor.getAttributes('tableHeader');
      setColorBar('v2-table-fill-bar', cellAttrs.backgroundColor || null);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  // Toolbar flottante d'image - parité V1 (js/editor.js:963-1003) : zoom -/+,
  // taille d'origine, alignement (flux normal) ou alignement-bord (calque,
  // réplique snapFloatingImageHorizontal), bascule en ligne/bloc, opacité,
  // calque devant/derrière/normal, suppression. Réutilise createFloatingPanel
  // (même helper que la toolbar de tableau, Incrément 1).
  function wireImageFloatingToolbar() {
    const html = [
      `<button data-action="zoom-out" title="Réduire">${Icons.svg('zoomOut')}</button>`,
      `<button data-action="zoom-in" title="Agrandir">${Icons.svg('zoomIn')}</button>`,
      `<button data-action="reset" title="Taille d'origine">${Icons.svg('resetSize')}</button>`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="align-left" title="Aligner à gauche">${Icons.svg('alignLeft')}</button>`,
      `<button data-action="align-center" title="Centrer">${Icons.svg('alignCenter')}</button>`,
      `<button data-action="align-right" title="Aligner à droite">${Icons.svg('alignRight')}</button>`,
      `<button data-action="wrap" title="Basculer en ligne / bloc">${Icons.svg('wrapToggle')}</button>`,
      '<span class="v2-floating-sep"></span>',
      '<input type="range" data-role="opacity" min="10" max="100" value="100" title="Opacité">',
      '<span class="v2-floating-sep"></span>',
      `<button data-action="layer-normal" title="Au cœur du texte">${Icons.svg('layerNormal')}</button>`,
      `<button data-action="layer-front" title="Devant le texte">${Icons.svg('layerFront')}</button>`,
      `<button data-action="layer-behind" title="Derrière le texte">${Icons.svg('layerBehind')}</button>`,
      '<span class="v2-floating-sep"></span>',
      `<button data-action="delete" title="Supprimer">${Icons.svg('trash')}</button>`,
    ].join('');

    // `editor.isActive('editorImage')` renvoie vrai dès qu'une SÉLECTION DE
    // TEXTE (pas juste un clic direct sur l'image) traverse la position DOM
    // de l'image - y compris une image en calque, déplacée visuellement
    // loin de cette position (son emplacement DOM reste celui où elle a été
    // insérée à l'origine, seul son rendu CSS left/top bouge). Sélectionner
    // un paragraphe où une image "flottait" auparavant activait donc à tort
    // la toolbar/le surlignage sur cette image, signalé cassé par
    // l'utilisateur. `selectedImageNode()` exige une VRAIE NodeSelection
    // ciblant précisément ce nœud (ce qu'un clic direct - ou la poignée de
    // déplacement - produit déjà, cf. NodeSelectionClass.create ailleurs
    // dans ce fichier) - une sélection de texte qui la traverse simplement
    // ne qualifie plus.
    // PAS de `instanceof NodeSelectionClass` ici (piège découvert en le
    // testant) : la sélection qu'un clic RÉEL sur l'image produit (créée en
    // interne par prosemirror-view, pas par ce fichier) échoue cet
    // `instanceof`, alors même que `.node` est bien présent et correct -
    // signe d'un second exemplaire du module `prosemirror-state` distinct de
    // celui importé ici (l'un des deux ne passe peut-être pas par le même
    // chemin de résolution que l'entrée `prosemirror-state` de l'importmap),
    // malgré le soin déjà pris ailleurs dans le projet pour éviter ce piège.
    // Duck-typing sur `.node` à la place : seule NodeSelection (quel que
    // soit l'exemplaire du module qui l'a construite) expose cette
    // propriété - une TextSelection, y compris une couvrant exactement la
    // position de l'image, ne l'a jamais.
    function selectedImageNode() {
      const node = editor.state.selection.node;
      return (node && node.type && node.type.name === 'editorImage') ? node : null;
    }

    function updateSelectedImage(patch) {
      const node = selectedImageNode();
      if (!node) return;
      const { state, view } = editor;
      const pos = state.selection.from;
      const tr = state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, patch));
      // Restaure explicitement la NodeSelection - cf. commentaire sur
      // NodeSelectionClass en tête de fichier : sans ça, un clic sur un
      // bouton de CETTE toolbar referme la toolbar aussitôt après avoir
      // appliqué l'action (setNodeMarkup remplace le nœud, la sélection par
      // défaut ne redevient pas forcément une NodeSelection dessus).
      if (NodeSelectionClass) tr.setSelection(NodeSelectionClass.create(tr.doc, pos));
      view.dispatch(tr);
    }

    // Aligner en flux normal (align gauche/centre/droite classique) ou, en
    // calque devant/derrière, réaligner l'image sur le bord correspondant du
    // conteneur (margin:auto n'a aucun effet sur un élément position:absolute,
    // même limitation que la V1 - cf. snapFloatingImageHorizontal).
    function alignOrSnap(align) {
      const node = selectedImageNode();
      if (!node) return;
      const { state } = editor;
      if (node.attrs.layer === 'normal') { updateSelectedImage({ align }); return; }
      const dom = editor.view.nodeDOM(state.selection.from);
      const img = dom && dom.querySelector && dom.querySelector('img');
      if (!img) return;
      const imgWidthPx = img.getBoundingClientRect().width;
      const containerWidthPx = editorContentWidthPx(editor);
      // `left` est stocké/appliqué depuis le bord de la boîte de PADDING
      // (cf. toggleLayer ci-dessus), mais l'alignement doit lui viser le
      // bord du TEXTE (boîte de contenu, cf. editorContentWidthPx) - d'où le
      // décalage explicite du padding ici, dans les deux sens.
      const rootCs = getComputedStyle(editor.view.dom);
      const padLeft = parseFloat(rootCs.paddingLeft) || 0;
      const left = align === 'left' ? padLeft : align === 'center' ? padLeft + Math.max(0, (containerWidthPx - imgWidthPx) / 2) : padLeft + Math.max(0, containerWidthPx - imgWidthPx);
      updateSelectedImage({ left: Math.round(left) });
    }

    // Sélecteur explicite à 3 états (normal/devant/derrière) - PAS un
    // bouton-bascule par calque comme avant (2 boutons seulement, aucune
    // icône dédiée pour "normal" - signalé confus par l'utilisateur : pas
    // clair qu'il y a 3 statuts distincts, ni comment revenir à "normal" si
    // on ne devine pas que c'est un bouton-bascule). Chaque bouton FIXE
    // explicitement le calque visé, cliquer celui déjà actif ne fait rien
    // (contrairement à l'ancien comportement "re-clique -> retour à
    // normal" : la case "normal" a maintenant sa propre icône dédiée pour
    // ça). Au premier passage en calque (devant/derrière), initialise
    // left/top depuis la position RENDUE actuelle de l'image (son rect réel
    // moins celui de la racine éditeur) pour qu'elle ne saute pas
    // visuellement au passage en position:absolute.
    function setLayer(target) {
      const node = selectedImageNode();
      if (!node) return;
      const { state, view } = editor;
      const pos = state.selection.from;
      if (node.attrs.layer === target) return;
      const patch = { layer: target };
      if (target !== 'normal' && (node.attrs.left == null || node.attrs.top == null)) {
        const dom = editor.view.nodeDOM(pos);
        const img = dom && dom.querySelector && dom.querySelector('img');
        if (img) {
          const imgRect = img.getBoundingClientRect();
          const rootEl = editor.view.dom;
          const rootRect = rootEl.getBoundingClientRect();
          // PAS de soustraction du padding ici : `left`/`top` sont ensuite
          // appliqués tels quels en CSS `position:absolute` (styleFor(),
          // ci-dessus) sur un wrapper dont le bloc englobant est CE MÊME
          // `rootEl` (.tiptap, position:relative) - le CSS interprète déjà
          // `left`/`top` depuis le bord de la boîte de PADDING (= bord de la
          // boîte de bordure, ici sans bordure), PAS depuis le bord de la
          // zone de contenu. Soustraire le padding ici décalait donc le
          // stockage vers une convention "depuis le contenu" que le rendu
          // CSS ne respecte jamais - l'image sautait visiblement de la
          // largeur du padding dès la bascule en calque (constaté
          // directement, sans même exporter), et ce même delta faussait
          // ensuite la position PDF (mêmes valeurs left/top réutilisées par
          // pdf-export.js). En ne retranchant rien, la valeur stockée
          // correspond exactement à ce que le CSS applique, dans N'IMPORTE
          // QUEL contexte de padding (éditeur réel à 37px, hôte de mesure PDF
          // à 0px compris) - le bord de boîte de padding ne bouge pas avec le
          // padding, seule la zone de contenu bouge.
          patch.left = Math.round(imgRect.left - rootRect.left);
          patch.top = Math.round(imgRect.top - rootRect.top);
        }
      }
      const tr = state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, patch));
      if (NodeSelectionClass) tr.setSelection(NodeSelectionClass.create(tr.doc, pos));
      view.dispatch(tr);
    }

    const panel = createFloatingPanel('v2-floating-toolbar', html, (action) => {
      const selNode = selectedImageNode();
      if (!selNode) return;
      const attrs = selNode.attrs;
      const commands = {
        'zoom-out': () => updateSelectedImage({ width: Math.round((parseFloat(attrs.width) || 320) * 0.75) + 'px' }),
        'zoom-in': () => updateSelectedImage({ width: Math.round((parseFloat(attrs.width) || 320) * 1.25) + 'px' }),
        reset: () => updateSelectedImage({ width: '320px', align: null }),
        'align-left': () => alignOrSnap('left'),
        'align-center': () => alignOrSnap('center'),
        'align-right': () => alignOrSnap('right'),
        wrap: () => updateSelectedImage({ wrap: attrs.wrap === 'block' ? 'inline' : 'block' }),
        'layer-normal': () => setLayer('normal'),
        'layer-front': () => setLayer('front'),
        'layer-behind': () => setLayer('behind'),
        delete: () => {
          const pos = editor.state.selection.from;
          editor.chain().focus().deleteRange({ from: pos, to: pos + selNode.nodeSize }).run();
        },
      };
      (commands[action] || (() => {}))();
    }, (role, value) => {
      if (role === 'opacity') updateSelectedImage({ opacity: Math.max(0.1, parseInt(value, 10) / 100) });
    });

    function syncState() {
      const node = selectedImageNode();
      if (!node) return;
      const attrs = node.attrs;
      const opacityInput = panel.el.querySelector('input[data-role="opacity"]');
      if (opacityInput && document.activeElement !== opacityInput) opacityInput.value = Math.round((attrs.opacity != null ? attrs.opacity : 1) * 100);
      const setActive = (action, isActive) => { const btn = panel.el.querySelector(`button[data-action="${action}"]`); if (btn) btn.classList.toggle('is-active', !!isActive); };
      setActive('align-left', attrs.align === 'left');
      setActive('align-center', attrs.align === 'center');
      setActive('align-right', attrs.align === 'right');
      setActive('wrap', attrs.wrap === 'block');
      setActive('layer-normal', !attrs.layer || attrs.layer === 'normal');
      setActive('layer-front', attrs.layer === 'front');
      setActive('layer-behind', attrs.layer === 'behind');
    }

    // Retour visuel de sélection (classe .editor-image-selected) recalculé
    // ICI à chaque passage plutôt que de dépendre de selectNode/deselectNode
    // de la NodeView (constaté peu fiable après un setNodeMarkup - cf.
    // commentaire dans updateAttrs) : on efface d'abord toute classe
    // résiduelle, puis on ne la repose que sur l'image RÉELLEMENT
    // sélectionnée. Source de vérité unique, correcte même si une NodeView a
    // été recréée entre-temps.
    const check = () => {
      document.querySelectorAll('.tiptap .editor-image-view.editor-image-selected').forEach(el => el.classList.remove('editor-image-selected'));
      if (!selectedImageNode()) { panel.hide(); return; }
      const dom = editor.view.nodeDOM(editor.state.selection.from);
      const img = dom && dom.querySelector && dom.querySelector('img');
      if (!img) { panel.hide(); return; }
      dom.classList.add('editor-image-selected');
      syncState();
      panel.show(img);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  // Barre flottante de formatage nombre/date d'une bulle #Variable, sur le
  // même modèle que celle de l'image (createFloatingPanel, sélection réelle
  // du nœud - cf. commentaire de selectedImageNode ci-dessus sur le piège
  // instanceof/duck-typing, même prudence ici). Le TYPE de colonne Grist
  // (GristAPI.getColumnType) détermine lequel des 2 sous-panneaux (nombre/
  // date) s'affiche - une colonne Texte/Référence n'a rien à formater, la
  // barre reste cachée. Rien n'est stocké sur le nœud tant que l'utilisateur
  // n'a rien choisi (`format: null` par défaut, cf. createVarBadgeNode) :
  // formatValue() garde alors son comportement historique (String(val) brut).
  function wireVariableFloatingToolbar() {
    const dateOptions = VariableFormat.DATE_PRESETS.map(p => `<option value="${p.key}">${p.label}</option>`).join('');
    const html = [
      '<div data-var-panel="number">',
      '<span class="v2-varfmt-seg">',
      '<button data-action="num-style:fr" title="Français : 1 234,56">FR</button>',
      '<button data-action="num-style:us" title="Anglo-saxon : 1,234.56">US</button>',
      '<button data-action="num-style:none" title="Sans séparateur de milliers">—</button>',
      '</span>',
      '<select data-role="num-decimals" title="Décimales"><option value="">Auto</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>',
      '<input type="text" data-role="num-currency" placeholder="Devise" title="Devise (€, $, personnalisé…)" maxlength="6">',
      '<span class="v2-floating-sep"></span>',
      '<button data-action="num-words" title="Écriture en toutes lettres (nombres entiers)">Lettres</button>',
      '</div>',
      '<div data-var-panel="date" hidden>',
      `<select data-role="date-preset" title="Format de date">${dateOptions}</select>`,
      '</div>',
    ].join('');
    const panel = createFloatingPanel('v2-floating-toolbar v2-varfmt-toolbar', html, onAction, onInput);

    function selectedVarBadgeNode() {
      const node = editor.state.selection.node;
      return (node && node.type && node.type.name === 'varBadge') ? node : null;
    }
    function updateSelectedBadge(patch) {
      const node = selectedVarBadgeNode();
      if (!node) return;
      const { state, view } = editor;
      const pos = state.selection.from;
      const format = Object.assign({}, node.attrs.format, patch);
      const tr = state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { format }));
      if (NodeSelectionClass) tr.setSelection(NodeSelectionClass.create(tr.doc, pos));
      view.dispatch(tr);
    }
    function onAction(action) {
      const node = selectedVarBadgeNode();
      if (!node) return;
      if (action.indexOf('num-style:') === 0) { updateSelectedBadge({ type: 'number', style: action.slice(10) }); return; }
      if (action === 'num-words') {
        const current = node.attrs.format || {};
        updateSelectedBadge({ type: 'number', words: !current.words });
      }
    }
    function onInput(role, value) {
      const node = selectedVarBadgeNode();
      if (!node) return;
      if (role === 'num-decimals') { updateSelectedBadge({ type: 'number', decimals: value === '' ? null : parseInt(value, 10) }); return; }
      if (role === 'num-currency') { updateSelectedBadge({ type: 'number', currency: value.trim() }); return; }
      if (role === 'date-preset') { updateSelectedBadge({ type: 'date', preset: value }); return; }
    }

    function syncState() {
      const node = selectedVarBadgeNode();
      if (!node) return;
      const format = node.attrs.format || {};
      const setActive = (action, isActive) => { const btn = panel.el.querySelector(`button[data-action="${action}"]`); if (btn) btn.classList.toggle('is-active', !!isActive); };
      const style = format.type === 'number' ? (format.style || 'fr') : 'fr';
      setActive('num-style:fr', style === 'fr');
      setActive('num-style:us', style === 'us');
      setActive('num-style:none', style === 'none');
      setActive('num-words', format.type === 'number' && !!format.words);
      panel.el.querySelector('[data-var-panel="number"]').classList.toggle('v2-varfmt-words-active', format.type === 'number' && !!format.words);
      const decimalsSelect = panel.el.querySelector('select[data-role="num-decimals"]');
      if (decimalsSelect && document.activeElement !== decimalsSelect) decimalsSelect.value = (format.type === 'number' && format.decimals != null) ? String(format.decimals) : '';
      const currencyInput = panel.el.querySelector('input[data-role="num-currency"]');
      if (currencyInput && document.activeElement !== currencyInput) currencyInput.value = (format.type === 'number' && format.currency) ? format.currency : '';
      const dateSelect = panel.el.querySelector('select[data-role="date-preset"]');
      if (dateSelect && document.activeElement !== dateSelect) dateSelect.value = (format.type === 'date' && format.preset) ? format.preset : VariableFormat.DATE_PRESETS[0].key;
    }

    const check = () => {
      const node = selectedVarBadgeNode();
      if (!node) { panel.hide(); return; }
      const type = GristAPI.getColumnType(node.attrs.table, node.attrs.column);
      const isNumber = type === 'Numeric' || type === 'Int';
      const isDate = type === 'Date' || type === 'DateTime';
      if (!isNumber && !isDate) { panel.hide(); return; }
      panel.el.querySelector('[data-var-panel="number"]').hidden = !isNumber;
      panel.el.querySelector('[data-var-panel="date"]').hidden = !isDate;
      const dom = editor.view.nodeDOM(editor.state.selection.from);
      if (!dom) { panel.hide(); return; }
      syncState();
      panel.show(dom);
    };
    editor.on('selectionUpdate', check);
    editor.on('transaction', check);
  }

  // Même vérification qu'en V1 (js/editor.js:436-445) : un fetch() sur la
  // même URL que pdf-export.js utilisera pour inliner l'image en base64 à
  // l'export - si ça échoue (serveur sans en-tête CORS permissif), l'export
  // devra silencieusement ignorer l'image. Non bloquant : l'insertion a déjà
  // eu lieu, ceci prévient juste l'utilisateur à l'avance plutôt que de le
  // laisser découvrir l'absence de l'image seulement après un export.
  async function warnIfImageUrlNotExportable(src) {
    if (!src || src.startsWith('data:')) return;
    try {
      const resp = await fetch(src);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      await resp.blob();
    } catch (e) {
      console.warn('[Editor] image probablement non exportable en PDF (CORS) :', src, e);
      window.alert('Cette image ne pourra probablement pas être incluse dans le PDF exporté : le serveur qui l\'héberge ne semble pas autoriser son téléchargement depuis ce widget (restriction CORS). Elle continuera de s\'afficher normalement ici et en mode lecture, mais l\'export PDF devra l\'ignorer.');
    }
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
    // v2-btn-align-main : icône initiale, resynchronisée dès le premier appel
    // de syncToolbarState avec l'alignement réel du curseur.
    set('v2-btn-align-main', 'alignLeft');
    set('v2-btn-bullet', 'bulletList'); set('v2-btn-ordered', 'orderedList');
    set('v2-btn-bullet-disc', 'bulletDisc'); set('v2-btn-bullet-circle', 'bulletCircle'); set('v2-btn-bullet-square', 'bulletSquare');
    set('v2-btn-blockquote', 'blockquote'); set('v2-btn-outdent', 'outdent'); set('v2-btn-indent', 'indent');
    set('v2-btn-table', 'table');
    set('v2-btn-two-columns', 'twoColumns'); set('v2-btn-image', 'image');
    set('v2-btn-page-break', 'pageBreak'); set('v2-btn-toc', 'toc');
    set('v2-btn-undo', 'undo'); set('v2-btn-redo', 'redo');
    set('v2-highlight-icon', 'highlight');
    set('v2-color-text-caret', 'caretDown'); set('v2-color-highlight-caret', 'caretDown');
    set('v2-font-chip-icon', 'font'); set('v2-font-chip-caret', 'caretDown');
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
    // Bouton principal du groupe survol "Alignement" (maquette "Options au
    // survol") : montre TOUJOURS l'alignement réel du curseur (gauche par
    // défaut, valeur par défaut de l'extension TextAlign) - currentAlign est
    // relu par son propre gestionnaire de clic pour le réappliquer tel quel.
    const aligns = ['left', 'center', 'right', 'justify'];
    currentAlign = aligns.find(a => editor.isActive({ textAlign: a })) || 'left';
    const alignMain = document.getElementById('v2-btn-align-main');
    if (alignMain) alignMain.innerHTML = Icons.svg('align' + currentAlign[0].toUpperCase() + currentAlign.slice(1));
    setActive('v2-btn-bullet', editor.isActive('bulletList'));
    const bulletStyle = editor.isActive('bulletList') ? (editor.getAttributes('bulletList').bulletStyle || 'disc') : null;
    setActive('v2-btn-bullet-disc', bulletStyle === 'disc');
    setActive('v2-btn-bullet-circle', bulletStyle === 'circle');
    setActive('v2-btn-bullet-square', bulletStyle === 'square');
    setActive('v2-btn-ordered', editor.isActive('orderedList'));
    setActive('v2-btn-blockquote', editor.isActive('blockquote'));
    const setDisabled = (id, disabled) => { const el = document.getElementById(id); if (el) el.disabled = !!disabled; };
    setDisabled('v2-btn-indent', !editor.can().sinkListItem('listItem'));
    setDisabled('v2-btn-outdent', !editor.can().liftListItem('listItem'));
    const headerSelect = document.getElementById('v2-header-select');
    if (headerSelect) {
      let value = 'p';
      for (let level = 1; level <= 6; level++) { if (editor.isActive('heading', { level })) value = String(level); }
      if (headerSelect.value !== value) headerSelect.value = value;
    }
    const textStyleAttrs = editor.getAttributes('textStyle');
    setColorBar('v2-color-text-bar', textStyleAttrs.color || '#000000');
    setColorBar('v2-color-highlight-bar', textStyleAttrs.backgroundColor || null);
    // Polices/tailles : les swatches de couleur ci-dessus étaient déjà
    // synchronisés sur le curseur, mais PAS ces deux <select> (signalé par
    // l'utilisateur - ex. curseur en Arial 15pt sans que la toolbar ne le
    // montre). Repli sur la police/taille RÉELLEMENT rendue en l'absence de
    // marque explicite (Roboto/10.5pt, cf. `.tiptap` dans editor-v2.css et
    // DEFAULT_FONT_SIZE dans pdf-export.js - les deux valeurs concordent
    // déjà, 14px = 10.5pt à 96dpi) plutôt qu'un vide "Police"/"Taille" qui
    // n'affichait jamais rien tant que l'utilisateur n'avait pas cliqué
    // explicitement un réglage (signalé par l'utilisateur : les valeurs par
    // défaut au clavier ne s'affichaient jamais).
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
    const { computePosition, offset, flip, shift, autoUpdate } = await import('@floating-ui/dom');
    floatingUi = { computePosition, offset, flip, shift, autoUpdate };
    ({ NodeSelection: NodeSelectionClass, TextSelection: TextSelectionClass } = await import('prosemirror-state'));

    const VarBadge = createVarBadgeNode(Node, mergeAttributes);
    const FontSize = createFontSizeExtension(Extension);
    const TextColor = createTextColorExtension(Extension);
    const HighlightColor = createHighlightExtension(Extension);
    const BulletStyle = createBulletStyleExtension(Extension);
    const TableHeaderWithBg = withCellBackground(TableHeader);
    const TableCellWithBg = withCellBackground(TableCell);
    const { TwoColumnsColumn, TwoColumnsZone } = createTwoColumnsNodes(Node, mergeAttributes);
    const EditorImage = createEditorImageNode(Node);
    const PageBreak = createPageBreakNode(Node);
    const HeadingNumberingConfig = createHeadingNumberingConfigNode(Node);
    const Toc = createTocNode(Node);

    editor = new TiptapEditor({
      element: document.getElementById('editor-container'),
      onUpdate: ({ editor: updatedEditor }) => { backfillAutoColumnWidths(updatedEditor); clampOverflowingTables(updatedEditor); },
      extensions: [
        StarterKit,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TextStyle,
        FontFamily,
        FontSize,
        TextColor,
        HighlightColor,
        BulletStyle,
        VarBadge,
        Variables.createExtension(Extension, Suggestion),
        // Tableau : extensions officielles, colonnes redimensionnables (même
        // comportement de poignée que la V1, cf. mémoire
        // project_table_resize_handle_regression) - validées dans
        // v2/smoke-test.html avec du contenu riche réel dans une cellule.
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
        createTabNavigationExtension(Extension),
      ],
      content: '',
    });

    wireToolbar();
    wireColorPickers();
    wireTableFloatingToolbar();
    wireImageFloatingToolbar();
    wireVariableFloatingToolbar();
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
    // Bouton principal du groupe survol - réapplique l'alignement qu'il
    // montre actuellement (currentAlign, tenu à jour par syncToolbarState) ;
    // les 4 boutons ci-dessus vivent maintenant dans le panneau révélé au
    // survol (cf. v2/index.html .v2-hover-flyout), inchangés sinon.
    bind('v2-btn-align-main', () => editor.chain().focus().setTextAlign(currentAlign).run());
    bind('v2-btn-bullet', () => editor.chain().focus().toggleBulletList().run());
    // Styles de puce, révélés au survol du bouton "Liste à puces" (maquette
    // "Options au survol") - crée la liste si le curseur n'y est pas encore,
    // sinon change juste le style de la liste existante à cet endroit.
    const applyBulletStyle = (style) => {
      const chain = editor.chain().focus();
      if (!editor.isActive('bulletList')) chain.toggleBulletList();
      chain.updateAttributes('bulletList', { bulletStyle: style }).run();
    };
    bind('v2-btn-bullet-disc', () => applyBulletStyle('disc'));
    bind('v2-btn-bullet-circle', () => applyBulletStyle('circle'));
    bind('v2-btn-bullet-square', () => applyBulletStyle('square'));
    bind('v2-btn-ordered', () => editor.chain().focus().toggleOrderedList().run());
    bind('v2-btn-blockquote', () => editor.chain().focus().toggleBlockquote().run());
    // Réutilisent les mêmes commandes que le Tab/Shift-Tab clavier dans une
    // liste (cf. createTabNavigationExtension) - sans effet (no-op, jamais
    // d'erreur) hors d'une liste, d'où l'état désactivé posé dans
    // syncToolbarState plutôt qu'un masquage complet du bouton.
    bind('v2-btn-outdent', () => editor.chain().focus().liftListItem('listItem').run());
    bind('v2-btn-indent', () => editor.chain().focus().sinkListItem('listItem').run());
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
      warnIfImageUrlNotExportable(url);
    });
    bind('v2-btn-page-break', () => editor.chain().focus().insertPageBreak().run());
    bind('v2-btn-toc', () => editor.chain().focus().insertToc().run());
    bind('v2-btn-undo', () => editor.chain().focus().undo().run());
    bind('v2-btn-redo', () => editor.chain().focus().redo().run());

    wireHeadingNumberingSelect();
    wireSelectionDependentSelects();
    wireCompactFontSizeControls();
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
    // Le <select> reste dans le DOM (masqué, cf. css/toolbar-v2.css) mais
    // n'est plus visible : le choix du style se fait désormais dans le
    // panneau révélé au survol du bouton (maquette "Options au survol").
    // Chaque ligne pose juste la valeur puis redéclenche 'change' - réutilise
    // le handler ci-dessus tel quel plutôt que de dupliquer la commande.
    const flyout = document.getElementById('v2-numbering-flyout');
    if (!flyout) return;
    const rows = flyout.querySelectorAll('.v2-hover-row');
    const syncActiveRow = () => rows.forEach(row => row.classList.toggle('is-active', row.dataset.num === select.value));
    rows.forEach(row => row.addEventListener('click', () => {
      if (select.value === row.dataset.num) return;
      select.value = row.dataset.num;
      select.dispatchEvent(new Event('change'));
      syncActiveRow();
    }));
    // Lu à la volée à chaque survol plutôt que poussé en continu : la valeur
    // peut aussi changer sans passer par ici (chargement d'un modèle, cf.
    // v2/js/main.js:loadTemplateIntoEditor qui pose select.value directement).
    const group = flyout.closest('.numbering-pill');
    if (group) group.addEventListener('mouseenter', syncActiveRow);
    syncActiveRow();
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
  }

  // Liste UNIQUE des tailles proposées, partagée par le stepper (-/+ passe au
  // preset voisin) et le panneau flottant (choix direct) - "Toolbar compacte"
  // option A, remplace l'ancien <select> natif dont "Times New Roman" imposait
  // sa largeur à toute la barre.
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
    let savedSelection = null;
    const captureSelection = () => { const { from, to } = editor.state.selection; savedSelection = { from, to }; };
    const withSavedSelection = (fn) => {
      const chain = editor.chain().focus();
      if (savedSelection) chain.setTextSelection(savedSelection);
      fn(chain);
      chain.run();
    };

    // Police : pastille icône+valeur, ouvre un panneau flottant (même
    // mécanisme que le menu de couleur) listant les polices supportées.
    const fontHtml = FONT_FAMILY_PRESETS.map(o => `<button data-action="${o.value}">${o.label}</button>`).join('');
    const fontPanel = createFloatingPanel('v2-format-panel', fontHtml, (value) => {
      withSavedSelection(chain => chain.setFontFamily(value));
      closeDropdownPanel();
    });
    wireDropdownButton(document.getElementById('v2-font-chip'), fontPanel, captureSelection);

    // Taille : stepper -/+ (passe au preset voisin dans FONT_SIZE_PRESETS) +
    // clic sur la valeur pour ouvrir le panneau (choix direct, comme police).
    const sizeHtml = FONT_SIZE_PRESETS.map(s => `<button data-action="${s}">${s}</button>`).join('');
    const sizePanel = createFloatingPanel('v2-format-panel', sizeHtml, (value) => {
      withSavedSelection(chain => chain.setFontSize(value));
      closeDropdownPanel();
    });
    const sizeValBtn = document.getElementById('v2-size-chip-val');
    wireDropdownButton(sizeValBtn, sizePanel, captureSelection);
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
    backfillAutoColumnWidths(editor);
    clampOverflowingTables(editor);
  }

  return { init, getHTML, setHTML, getHeadingNumberingStyle };
})();
