// Fabriques de nœuds/extensions TipTap personnalisés - extrait de editor.js (découpage 2026). Aucune ne ferme sur une référence d'éditeur partagée : chaque
// NodeView reçoit la sienne via le paramètre `({ node, editor, getPos }) => {...}` fourni par TipTap à chaque rendu (vérifié pour toutes celles ci-dessous).
const EditorNodes = (function () {
  // Touche de déclenchement configurable (panneau Réglages) - lue directement depuis localStorage, même clé que js/variables.js (pas de dépendance de module
  // croisée pour une simple lecture, cf. son en-tête).
  function varBadgeTriggerChar() {
    try {
      const v = localStorage.getItem('pp_trigger_char');
      return (v && v.length === 1) ? v : '#';
    } catch (e) { return '#'; }
  }

  // Badge de variable #Variable — nœud "atome" en ligne, non éditable au caractère près (contenteditable="false") : <span class="var-badge" data-table
  // data-column data-key>, reconnu tel quel par reader-mode.js/pdf-export.js.
  function createVarBadgeNode(Node, mergeAttributes) {
    return Node.create({
      name: 'varBadge',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        // renderHTML: () => ({}) sur chaque attribut : sans ça, TipTap rend aussi CHAQUE attribut par défaut comme attribut HTML bare (table="...") EN PLUS
        // des data-table/data-column/data-key posés à la main ci-dessous - doublon. Ces attributs ne doivent exister que dans le JSON interne du nœud.
        const noBareRender = { default: null, renderHTML: () => ({}) };
        // `format` : { type:'number', style, decimals, currency, words } ou { type:'date', preset } - choisi via la barre flottante (cf.
        // wireVariableFloatingToolbar), `null` tant que l'utilisateur n'a rien réglé (comportement historique, String(val) brut).
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
        // Préfixe décoratif régénéré à chaque rendu (jamais stocké) : suit la touche de déclenchement configurée, rétroactif sans migration.
        return ['span', attrs, varBadgeTriggerChar() + node.attrs.key];
      },
    });
  }

  // Badge de numéro de page - même schéma que VarBadge. Le libellé rendu dans l'éditeur n'est qu'un espace réservé visuel (format choisi), résolu en vrai
  // numéro seulement à l'export/l'aperçu paginé.
  function createPageNumberBadgeNode(Node, mergeAttributes) {
    const LABELS = { n: '#', 'page-n': 'Page #', 'n-slash-total': '#/#' };
    return Node.create({
      name: 'pageNumberBadge',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        return { format: { default: 'n', renderHTML: () => ({}) } };
      },
      parseHTML() {
        return [{ tag: 'span.page-number-badge', getAttrs: el => ({ format: el.getAttribute('data-format') || 'n' }) }];
      },
      renderHTML({ node }) {
        const attrs = mergeAttributes({ class: 'page-number-badge', contenteditable: 'false', 'data-format': node.attrs.format });
        return ['span', attrs, LABELS[node.attrs.format] || LABELS.n];
      },
      addCommands() {
        return { insertPageNumberBadge: format => ({ chain }) => chain().insertContent({ type: this.name, attrs: { format } }).run() };
      },
    });
  }

  // Chip intelligent - date/heure/email, même schéma que VarBadge. Jamais de vraie valeur dans l'éditeur (résolu en mode Lecture/export, cf.
  // js/reader-mode.js:resolveSmartChips) - vert plutôt que bleu pour signaler "valeur calculée, pas une colonne Grist".
  function createSmartChipNode(Node, mergeAttributes) {
    const KIND_I18N_KEYS = { date: 'chips.date', time: 'chips.time', email: 'chips.email' };
    function labelFor(kind) {
      const key = KIND_I18N_KEYS[kind];
      return key ? I18n.t(key) : '?';
    }
    return Node.create({
      name: 'smartChip',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        return { kind: { default: 'date', renderHTML: () => ({}) } };
      },
      parseHTML() {
        return [{ tag: 'span.smart-chip', getAttrs: el => ({ kind: el.getAttribute('data-chip-kind') || 'date' }) }];
      },
      renderHTML({ node }) {
        const attrs = mergeAttributes({ class: 'smart-chip', contenteditable: 'false', 'data-chip-kind': node.attrs.kind });
        return ['span', attrs, labelFor(node.attrs.kind)];
      },
    });
  }

  // Note de bas de page - nœud atome portant le texte en attribut (`text`, texte brut). Numérotation continue sur tout le document via le seul compteur CSS
  // `footnote-ref` (cf. editor-v2.css), jamais compté en JS.
  function createFootnoteRefNode(Node, mergeAttributes) {
    return Node.create({
      name: 'footnoteRef',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        return {
          id: { default: null, renderHTML: () => ({}) },
          text: { default: '', renderHTML: () => ({}) },
        };
      },
      parseHTML() {
        return [{ tag: 'sup.footnote-ref-marker', getAttrs: el => ({ id: el.getAttribute('data-note-id'), text: el.getAttribute('data-note-text') || '' }) }];
      },
      renderHTML({ node }) {
        const attrs = mergeAttributes({
          class: 'footnote-ref-marker', contenteditable: 'false',
          'data-note-id': node.attrs.id, 'data-note-text': node.attrs.text,
        });
        // Contenu texte vide à dessein : le chiffre vient de `::before { content: counter(footnote-ref) }` (editor-v2.css).
        return ['sup', attrs];
      },
      addNodeView() {
        return ({ getPos }) => {
          const marker = document.createElement('sup');
          marker.className = 'footnote-ref-marker';
          marker.addEventListener('mousedown', event => {
            event.preventDefault();
            // PAS de stopPropagation() : ProseMirror sélectionne ce nœud via un gestionnaire posé sur .tiptap (un ancêtre) - la bloquer casserait la
            // sélection au clic donc la suppression au clavier.
            const pos = getPos();
            if (typeof pos === 'number') Editor.openFootnoteEditorAt(pos);
          });
          return { dom: marker };
        };
      },
    });
  }

  // Commentaire - une MARQUE (pas un nœud) : contrairement à une note de bas de page (un point unique), un commentaire s'attache à une PORTÉE de texte
  // existant, exactement comme gras/italique - ProseMirror la déplace/étend/découpe automatiquement au fil des modifications, sans code de suivi à écrire
  // à la main (cf. js/comments.js pour le pourquoi de ce choix face à un vrai suivi de modifications). Le FIL de discussion (auteur, texte, réponses) vit
  // dans la table Grist Publipostage_Commentaires (js/comments.js) - seul un identifiant y est stocké, pour relier la portée de texte à SON fil. `resolved`
  // en revanche vit ICI, dans le document lui-même (pas dans Grist) : c'est une propriété de CETTE portée de texte précise, pas du message échangé - la
  // garder dans le document la fait voyager gratuitement avec le reste (auto-save, Annuler/Rétablir, export) sans re-synchronisation à écrire.
  // `excludes: ''` (au lieu du défaut - le nom de la marque elle-même) : sans ça, une deuxième marque commentaire (id différent) posée sur une portée qui
  // chevauche une première ferait disparaître la première au lieu de les superposer - deux fils de discussion indépendants doivent pouvoir coexister sur un
  // chevauchement, comme le fait l'exemple officiel ProseMirror pour ce même besoin.
  function createCommentMark(Mark, mergeAttributes) {
    return Mark.create({
      name: 'commentMark',
      excludes: '',
      inclusive: false,
      addAttributes() {
        return {
          id: { default: null, renderHTML: attrs => ({ 'data-comment-id': attrs.id }) },
          resolved: {
            default: false,
            parseHTML: el => el.getAttribute('data-resolved') === 'true',
            renderHTML: attrs => ({ 'data-resolved': attrs.resolved ? 'true' : 'false' }),
          },
        };
      },
      parseHTML() {
        return [{ tag: 'span.comment-mark', getAttrs: el => ({ id: el.getAttribute('data-comment-id'), resolved: el.getAttribute('data-resolved') === 'true' }) }];
      },
      renderHTML({ HTMLAttributes }) {
        const cls = 'comment-mark' + (HTMLAttributes['data-resolved'] === 'true' ? ' comment-mark-resolved' : '');
        return ['span', mergeAttributes(HTMLAttributes, { class: cls }), 0];
      },
    });
  }

  // Augmente la marque 'textStyle' via addGlobalAttributes (comme FontFamily/Color officiels) - 'textStyle' doit être enregistrée à part (TextStyle, câblée
  // dans init()), sinon ProseMirror lève une erreur.
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

  // Couleur de police/surlignage - même schéma que FontSize.
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

  // Style de puce - augmente 'bulletList' (StarterKit) plutôt que 'textStyle'.
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

  // Style de numérotation - augmente 'orderedList'.
  function createOrderedListStyleExtension(Extension) {
    return Extension.create({
      name: 'orderedListStyle',
      addGlobalAttributes() {
        return [{
          types: ['orderedList'],
          attributes: {
            numberStyle: {
              default: 'decimal',
              parseHTML: el => el.getAttribute('data-number-style') || 'decimal',
              renderHTML: attrs => (attrs.numberStyle && attrs.numberStyle !== 'decimal' ? { 'data-number-style': attrs.numberStyle } : {}),
            },
          },
        }];
      },
    });
  }

  // Style de case à cocher - augmente 'taskList'. Rendu réel en CSS (data-tasklist-style), cette extension ne fait que sérialiser le choix.
  function createTaskListStyleExtension(Extension) {
    return Extension.create({
      name: 'taskListStyle',
      addGlobalAttributes() {
        return [{
          types: ['taskList'],
          attributes: {
            taskListStyle: {
              default: 'accentStrike',
              parseHTML: el => el.getAttribute('data-tasklist-style') || 'accentStrike',
              renderHTML: attrs => (attrs.taskListStyle && attrs.taskListStyle !== 'accentStrike' ? { 'data-tasklist-style': attrs.taskListStyle } : {}),
            },
          },
        }];
      },
    });
  }

  // Fond de cellule - augmente TableCell/TableHeader du même backgroundColor que le surlignage de texte (lu par pdf-export.js:tableFrom, pas inheritedStyle).
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
  // Zone 2 colonnes - paire de nœuds imbriqués. `isolating: true` empêche backspace/suppr de fusionner la zone avec le paragraphe voisin. Tab/Shift-Tab
  // court-circuitent d'abord l'indentation de liste (Table sinon l'emporte sur StarterKit en cellule), sinon déplacent/sortent le curseur de colonne.
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
              // Toujours consommé, même en cas d'échec du sink : jamais de repli sur un changement de cellule/colonne.
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
              ed.chain().focus().setTextSelection(EditorCore.getTextSelectionClass().near(target, 1)).run();
              return true;
            }
            const afterZone = $from.after(zoneDepth);
            if (afterZone >= ed.state.doc.content.size) {
              ed.chain().focus().insertContentAt(afterZone, { type: 'paragraph' }).setTextSelection(afterZone + 1).run();
              return true;
            }
            ed.chain().focus().setTextSelection(EditorCore.getTextSelectionClass().near(ed.state.doc.resolve(afterZone), 1)).run();
            return true;
          },
          'Shift-Tab': ({ editor: ed }) => {
            if (ed.isActive('listItem')) {
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
              ed.chain().focus().setTextSelection(EditorCore.getTextSelectionClass().near(target, -1)).run();
              return true;
            }
            const beforeZone = $from.before(zoneDepth);
            if (beforeZone <= 0) return true; // rien avant la zone - sans effet
            ed.chain().focus().setTextSelection(EditorCore.getTextSelectionClass().near(ed.state.doc.resolve(beforeZone - 1), -1)).run();
            return true;
          },
        };
      },
    });
  }

  // TipTap v3 n'expose plus de commande clearHistory (seulement undo/redo) : reconstruire l'EditorState avec les mêmes plugins réinitialise leur état (dont
  // l'historique) sans recréer la vue ni perdre le document.
  function createClearHistoryExtension(Extension, EditorState) {
    return Extension.create({
      name: 'clearHistory',
      addCommands() {
        return {
          clearHistory: () => ({ editor: ed }) => {
            const { view } = ed;
            view.updateState(EditorState.create({ schema: view.state.schema, doc: view.state.doc, selection: view.state.selection, plugins: view.state.plugins }));
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
          // Largeur (%) de la colonne gauche, clampée 20-80 au glisser, sérialisée en variable CSS --layout-left. Reste la SEULE source de vérité tant
          // que layoutLeftMm est absent (mode pourcentage, comportement historique). En mode mm, --layout-left porte une LONGUEUR ("60mm") et non plus un
          // pourcentage : on ne la relit alors pas ici (layoutLeftMm fait foi), sans quoi "60mm" serait relu comme "60 %".
          layoutLeft: {
            default: 50,
            parseHTML: el => {
              const raw = el.style.getPropertyValue('--layout-left');
              const v = parseFloat(raw);
              return (/%\s*$/.test(raw) && Number.isFinite(v)) ? v : 50;
            },
            renderHTML: () => ({}),
          },
          // Largeur ABSOLUE (mm) de la colonne gauche - `null` = mode pourcentage (défaut, comportement inchangé). Non-null = mode mm : --layout-left est
          // alors posée en MILLIMÈTRES, pas en pourcentage. La différence n'est pas cosmétique : un pourcentage s'applique à la boîte de CONTENU de la
          // zone (amputée de son padding/bordure), donc "60mm" converti en % ne donnait 60mm nulle part - 57.7mm à l'écran et dans le PDF, 60mm dans le
          // DOCX. Une longueur absolue vaut 60mm partout, et le moteur CSS la réévalue tout seul quand les marges de page changent, sans redessin JS.
          layoutLeftMm: {
            default: null,
            parseHTML: el => { const v = parseFloat(el.style.getPropertyValue('--layout-left-mm')); return Number.isFinite(v) ? v : null; },
            renderHTML: () => ({}),
          },
        };
      },
      parseHTML() { return [{ tag: 'div.two-columns-zone' }]; },
      renderHTML({ HTMLAttributes, node }) {
        const mm = node.attrs.layoutLeftMm;
        const style = Number.isFinite(mm)
          ? `--layout-left: ${mm}mm; --layout-left-mm: ${mm}mm`
          : `--layout-left: ${node.attrs.layoutLeft || 50}%`;
        return ['div', mergeAttributes(HTMLAttributes, { class: 'two-columns-zone', style }), 0];
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
      // dom = wrapper externe (ancre la poignée en absolu) englobant contentDOM (les 2 colonnes) et la poignée, hors contentDOM pour éviter qu'une future
      // réconciliation la retire. --layout-left posé sur le wrapper (hérite vers le bas ; la poignée ne le verrait pas posé sur contentDOM).
      addNodeView() {
        return ({ node, editor: nodeEditor, getPos }) => {
          const wrap = document.createElement('div');
          wrap.className = 'two-columns-zone-outer';
          const contentDOM = document.createElement('div');
          contentDOM.className = 'two-columns-zone';
          wrap.appendChild(contentDOM);
          const grip = document.createElement('div');
          grip.className = 'two-columns-resize-grip';
          grip.title = I18n.t('twoColumns.resizeGrip');
          wrap.appendChild(grip);
          // Bouton dédié, indépendant de la poignée de glisser (pas de clic-sans-bouger ambigu à détecter) : ouvre un popover avec les DEUX largeurs
          // (gauche saisissable, droite affichée en direct) plutôt qu'un seul champ ambigu ("largeur de QUOI ?").
          const mmButton = document.createElement('button');
          mmButton.type = 'button';
          mmButton.className = 'two-columns-mm-button';
          mmButton.title = I18n.t('twoColumns.widthMmButton');
          mmButton.textContent = 'mm';
          wrap.appendChild(mmButton);

          // En mode mm, --layout-left porte la longueur elle-même : plus rien à recalculer quand les marges de page changent (le CSS s'en charge), là où
          // le pourcentage dérivé d'avant restait figé à sa valeur d'origine - Editor.refreshLayout() dispatchait une transaction vide qui ne déclenchait
          // aucune réconciliation de NodeView, si bien que l'écran gardait l'ancien ratio pendant que getHTML() sérialisait déjà le nouveau.
          const effectiveTrack = attrs => Number.isFinite(attrs.layoutLeftMm)
            ? attrs.layoutLeftMm + 'mm'
            : (attrs.layoutLeft || 50) + '%';
          const applyLayout = attrs => wrap.style.setProperty('--layout-left', effectiveTrack(attrs));
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
            const finalLeftPercent = Math.max(20, Math.min(80, parseFloat(wrap.style.getPropertyValue('--layout-left')) || 50));
            const pos = getPos();
            if (typeof pos !== 'number') return;
            const { state, view } = nodeEditor;
            const current = state.doc.nodeAt(pos);
            if (!current) return;
            const newAttrs = Object.assign({}, current.attrs, { layoutLeft: Math.round(finalLeftPercent) });
            // Reste en mode mm après un glisser (ne repasse pas silencieusement en mode pourcentage) : reconvertit la position finale en mm.
            if (Number.isFinite(current.attrs.layoutLeftMm)) {
              newAttrs.layoutLeftMm = Math.round(finalLeftPercent / 100 * PageLayout.getContentWidthMm());
            }
            view.dispatch(state.tr.setNodeMarkup(pos, undefined, newAttrs));
          }
          grip.addEventListener('mousedown', event => {
            event.preventDefault(); event.stopPropagation();
            dragging = true;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp, { once: true });
          });

          // Popover du bouton "mm" (séparé de la poignée, cf. mmButton ci-dessus) : deux valeurs affichées (gauche saisissable, droite = le reste de la
          // largeur de contenu, recalculée en direct) - plus clair qu'un seul champ dont on ne sait pas s'il décrit la colonne de gauche ou de droite.
          let popover = null;
          function closePopover() {
            if (!popover) return;
            // `remove()` sur un nœud que ProseMirror a déjà détaché en recréant la NodeView lève une exception : le blur de l'input, déclenché PAR ce
            // détachement, rappelle closePopover alors que le popover n'a plus de parent. On remet `popover` à null d'abord, pour que ce second appel
            // sorte tout de suite quoi qu'il arrive.
            const el = popover;
            popover = null;
            document.removeEventListener('mousedown', onDocMouseDown, true);
            if (el.parentNode) el.parentNode.removeChild(el);
          }
          function onDocMouseDown(event) {
            if (popover && !popover.contains(event.target) && event.target !== mmButton) closePopover();
          }
          function commitMm(value) {
            const pos = getPos();
            if (typeof pos !== 'number') return;
            const { state, view } = nodeEditor;
            const current = state.doc.nodeAt(pos);
            if (!current) return;
            const contentWidthMm = PageLayout.getContentWidthMm();
            // La gouttière (PageLayout.getColumnGapMm()) est prise sur la largeur de contenu comme n'importe quelle colonne : la borne haute doit la
            // retrancher, sinon une saisie "largeur de contenu - 10" laisse une colonne droite NÉGATIVE.
            const gapMm = PageLayout.getColumnGapMm();
            const clamped = Math.max(10, Math.min(contentWidthMm - gapMm - 10, value));
            const pct = (clamped / contentWidthMm) * 100;
            view.dispatch(state.tr.setNodeMarkup(pos, undefined, Object.assign({}, current.attrs, { layoutLeftMm: clamped, layoutLeft: Math.round(pct) })));
          }
          function currentNodeAttrs() {
            const pos = getPos();
            if (typeof pos !== 'number') return node.attrs;
            const current = nodeEditor.state.doc.nodeAt(pos);
            return current ? current.attrs : node.attrs;
          }
          function openPopover() {
            if (popover) { closePopover(); return; }
            const currentAttrs = currentNodeAttrs();
            const contentWidthMm = PageLayout.getContentWidthMm();
            const startLeftMm = Number.isFinite(currentAttrs.layoutLeftMm)
              ? currentAttrs.layoutLeftMm
              : Math.round((currentAttrs.layoutLeft || 50) / 100 * contentWidthMm);

            popover = document.createElement('div');
            popover.className = 'two-columns-mm-popover';
            const leftLabel = document.createElement('label');
            leftLabel.textContent = I18n.t('twoColumns.widthMmLeftLabel');
            const leftInput = document.createElement('input');
            leftInput.type = 'number';
            leftInput.min = '10';
            leftInput.step = '1';
            leftInput.value = Math.round(startLeftMm);
            leftLabel.appendChild(leftInput);
            const rightLabel = document.createElement('label');
            rightLabel.textContent = I18n.t('twoColumns.widthMmRightLabel');
            const rightDisplay = document.createElement('span');
            rightDisplay.className = 'two-columns-mm-computed';
            rightLabel.appendChild(rightDisplay);
            popover.appendChild(leftLabel);
            popover.appendChild(rightLabel);
            wrap.appendChild(popover);

            // La colonne droite, c'est le reste de la largeur de contenu MOINS la gouttière - l'afficher sans la retrancher promettait 90mm là où
            // l'éditeur, le PDF et le DOCX rendent 85.8mm.
            const gapMm = PageLayout.getColumnGapMm();
            const refreshRightDisplay = () => {
              const v = parseFloat(leftInput.value);
              rightDisplay.textContent = Number.isFinite(v) ? Math.round(contentWidthMm - gapMm - v) : '—';
            };
            refreshRightDisplay();
            leftInput.addEventListener('input', refreshRightDisplay);
            leftInput.focus();
            leftInput.select();

            // `settled` évite qu'Escape committe quand même : retirer le popover du DOM déclenche un blur natif sur l'input encore focus, qui sans ce
            // garde-fou rappellerait commitAndClose() une seconde fois (Escape est censé annuler, pas valider).
            let settled = false;
            function commitAndClose() {
              if (settled) return;
              settled = true;
              const v = parseFloat(leftInput.value);
              if (Number.isFinite(v)) commitMm(v);
              closePopover();
            }
            function cancelAndClose() {
              settled = true;
              closePopover();
            }
            leftInput.addEventListener('keydown', event => {
              // `wrap` (donc ce popover) vit DANS l'arbre contentEditable de ProseMirror (c'est le `dom` de cette NodeView) : sans stopPropagation, un
              // keydown tapé ici remonte jusqu'au gestionnaire posé par ProseMirror sur .tiptap, qui l'intercepte comme une commande d'édition du
              // DOCUMENT (baseKeymap: Suppr -> joinForward/selectNodeForward, etc.) et appelle preventDefault - la touche Suppr semblait alors mangée,
              // sans jamais supprimer le caractère dans ce simple champ number. Repéré par l'utilisateur (Suppr inopérant dans ce champ précis, mais pas
              // dans les autres champs de l'app - eux vivent hors de .tiptap, posés sur document.body par EditorCore.createFloatingPanel).
              event.stopPropagation();
              if (event.key === 'Enter') { event.preventDefault(); commitAndClose(); }
              else if (event.key === 'Escape') { event.preventDefault(); cancelAndClose(); }
            });
            leftInput.addEventListener('blur', commitAndClose);
            // Capture (pas bubble) : doit voir le mousedown AVANT que le blur de l'input ne ferme déjà le popover, sinon un clic sur le fond de l'éditeur
            // rouvrirait/fermerait de façon incohérente.
            setTimeout(() => document.addEventListener('mousedown', onDocMouseDown, true), 0);
          }
          mmButton.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation();
            openPopover();
          });

          return {
            dom: wrap,
            contentDOM,
            update: updatedNode => {
              if (updatedNode.type.name !== 'twoColumnsZone') return false;
              if (!dragging) applyLayout(updatedNode.attrs);
              return true;
            },
            destroy: () => { document.removeEventListener('mousemove', onMove); closePopover(); },
            // Sans ça, ProseMirror voit la mutation de style pendant le glisser (hors transaction) comme inattendue et recrée le NodeView - le wrapper
            // devient alors détaché avant le mouseup, et le commit final s'applique à un nœud fantôme.
            ignoreMutation: () => true,
          };
        };
      },
    });
    return { TwoColumnsColumn, TwoColumnsZone };
  }

  // Image - nœud atome en ligne : `layer` (normal/devant/derrière), `opacity`, `align`, `wrap`. Chaque attribut garde renderHTML: () => ({}) - le nœud
  // construit lui-même la chaîne `style` complète ci-dessous.
  function createEditorImageNode(Node) {
    const noBareRender = () => ({});
    // `height` n'est posé que pour une image liée à une variable (placeholder de taille fixe, mode "contain" côté rendu).
    function styleFor(a) {
      const parts = [];
      if (a.width) parts.push(`width: ${a.width}`);
      if (a.varTable && a.height) parts.push(`height: ${a.height}`);
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
          height: { default: null, parseHTML: el => el.style.height || null, renderHTML: noBareRender },
          layer: { default: 'normal', parseHTML: el => el.getAttribute('data-layer') || 'normal', renderHTML: noBareRender },
          left: { default: null, parseHTML: el => (el.style.left ? parseFloat(el.style.left) : null), renderHTML: noBareRender },
          top: { default: null, parseHTML: el => (el.style.top ? parseFloat(el.style.top) : null), renderHTML: noBareRender },
          opacity: { default: 1, parseHTML: el => (el.style.opacity !== '' ? parseFloat(el.style.opacity) : 1), renderHTML: noBareRender },
          align: { default: null, parseHTML: el => el.getAttribute('data-align') || null, renderHTML: noBareRender },
          wrap: { default: 'inline', parseHTML: el => el.getAttribute('data-wrap') || 'inline', renderHTML: noBareRender },
          // Position "grille page" : capturée UNE FOIS, directement depuis le rendu réel de l'éditeur (Aperçu A4), au moment où l'image est positionnée
          // (setLayer/glisser/aligner) - pdf-export.js l'utilise telle quelle, sans reconstruction ni ancrage textuel, pour garantir un rendu identique
          // entre l'éditeur et le PDF. `null` = jamais positionnée ainsi (document ancien, ou positionnée hors Aperçu A4) - repli sur l'ancien système.
          pageIndex: { default: null, parseHTML: el => (el.hasAttribute('data-page-index') ? parseInt(el.getAttribute('data-page-index'), 10) : null), renderHTML: noBareRender },
          pageLeftPt: { default: null, parseHTML: el => (el.hasAttribute('data-page-left-pt') ? parseFloat(el.getAttribute('data-page-left-pt')) : null), renderHTML: noBareRender },
          pageTopPt: { default: null, parseHTML: el => (el.hasAttribute('data-page-top-pt') ? parseFloat(el.getAttribute('data-page-top-pt')) : null), renderHTML: noBareRender },
          // Posés ensemble : transforment ce nœud en placeholder de #Variable Attachments (jamais de vraie image dans l'éditeur).
          varTable: { default: null, parseHTML: el => el.getAttribute('data-var-table') || null, renderHTML: noBareRender },
          varColumn: { default: null, parseHTML: el => el.getAttribute('data-var-column') || null, renderHTML: noBareRender },
          varKey: { default: null, parseHTML: el => el.getAttribute('data-var-key') || null, renderHTML: noBareRender },
        };
      },
      parseHTML() { return [{ tag: 'img.editor-image' }]; },
      renderHTML({ node }) {
        const a = node.attrs;
        // Placeholder lié à une variable : `src` reste vide (résolu au rendu/export par js/reader-mode.js:resolveVariableImages).
        const attrs = { class: 'editor-image', draggable: 'false', src: a.varTable ? '' : a.src, alt: a.alt, style: styleFor(a), 'data-layer': a.layer, 'data-wrap': a.wrap };
        if (a.align) attrs['data-align'] = a.align;
        if (a.pageIndex != null) attrs['data-page-index'] = String(a.pageIndex);
        if (a.pageLeftPt != null) attrs['data-page-left-pt'] = String(a.pageLeftPt);
        if (a.pageTopPt != null) attrs['data-page-top-pt'] = String(a.pageTopPt);
        if (a.varTable) {
          attrs['data-var-table'] = a.varTable;
          attrs['data-var-column'] = a.varColumn;
          attrs['data-var-key'] = a.varKey;
        }
        return ['img', attrs];
      },
      addCommands() {
        return { insertImage: attrs => ({ chain }) => chain().insertContent({ type: this.name, attrs }).run() };
      },
      // NodeView : les poignées sont de vrais enfants DOM du wrapper, positionnées en pur CSS.
      addNodeView() {
        return ({ node, editor: nodeEditor, getPos }) => {
          const wrap = document.createElement('span');
          wrap.className = 'editor-image-view';
          const img = document.createElement('img');
          img.className = 'editor-image';
          img.draggable = false;
          wrap.appendChild(img);

          // Placeholder de #Variable : <span> superposé (icône + "#Table.Colonne") plutôt que de compter sur le rendu natif d'un <img src="">. Le <img> reste
          // dans le DOM, invisible, pour continuer à porter width/height (poignées, toolbar flottante).
          const varLabel = document.createElement('span');
          varLabel.className = 'editor-image-var-label';
          wrap.appendChild(varLabel);

          const moveHandle = document.createElement('span');
          moveHandle.className = 'editor-image-move-handle';
          moveHandle.title = I18n.t('image.moveHandle');
          wrap.appendChild(moveHandle);
          ['nw', 'ne', 'sw', 'se'].forEach(corner => {
            const h = document.createElement('span');
            h.className = 'editor-image-handle editor-image-handle-' + corner;
            wrap.appendChild(h);
            h.addEventListener('mousedown', event => startResize(event, corner));
          });
          moveHandle.addEventListener('mousedown', startMove);
          // Une fois DÉJÀ sélectionnée, permet de glisser directement au clic sur l'image (pas seulement sur la poignée de déplacement) - le tout premier
          // clic suit le chemin normal de sélection ProseMirror.
          img.addEventListener('mousedown', event => {
            if (!wrap.classList.contains('editor-image-layered')) return;
            if (!wrap.classList.contains('editor-image-selected')) return;
            startMove(event);
          });

          // Le z-index négatif ("derrière le texte") est posé sur l'<img> seule, pas le wrapper : sinon la poignée de déplacement (enfant du wrapper) serait
          // entraînée derrière le texte avec lui, devenant impossible à re-sélectionner une fois cachée.
          function applyAttrs(attrs) {
            const isVarBox = !!attrs.varTable;
            img.src = isVarBox ? '' : (attrs.src || '');
            img.alt = attrs.alt || '';
            const imgStyle = [];
            if (attrs.width) imgStyle.push(`width: ${attrs.width}`);
            if (isVarBox && attrs.height) imgStyle.push(`height: ${attrs.height}`);
            if (attrs.opacity !== 1 && attrs.opacity != null) imgStyle.push(`opacity: ${attrs.opacity}`);
            if (attrs.layer !== 'normal') imgStyle.push('position: relative', `z-index: ${attrs.layer === 'front' ? 5 : -1}`);
            img.setAttribute('style', imgStyle.join('; '));
            wrap.classList.toggle('editor-image-var-placeholder', isVarBox);
            varLabel.textContent = isVarBox ? ('#' + (attrs.varKey || '')) : '';
            const layered = attrs.layer !== 'normal';
            wrap.classList.toggle('editor-image-layered', layered);
            if (layered) {
              wrap.style.position = 'absolute';
              wrap.style.left = (attrs.left || 0) + 'px';
              wrap.style.top = (attrs.top || 0) + 'px';
              // Largeur explicite (pas de shrink-to-fit implicite) : dans une cellule de tableau étroite, le shrink-to-fit par défaut s'effondre à 0 quand
              // l'image approche la largeur du bloc englobant.
              wrap.style.width = attrs.width || '';
            } else {
              wrap.style.position = ''; wrap.style.left = ''; wrap.style.top = ''; wrap.style.width = '';
            }
            moveHandle.style.display = layered ? '' : 'none';
            if (attrs.align) wrap.setAttribute('data-align', attrs.align); else wrap.removeAttribute('data-align');
            wrap.setAttribute('data-wrap', attrs.wrap || 'inline');
          }
          applyAttrs(node.attrs);

          // Le retour visuel de sélection (classe CSS) n'est pas géré ici ni via selectNode/deselectNode (peu fiable après un setNodeMarkup qui remplace le
          // nœud) : centralisé dans wireImageFloatingToolbar.check(), qui recalcule l'état à chaque transaction depuis editor.isActive('editorImage').
          function updateAttrs(patch) {
            const pos = getPos();
            if (typeof pos !== 'number') return;
            const current = nodeEditor.state.doc.nodeAt(pos);
            if (!current) return;
            EditorCore.patchNodeAndReselect(nodeEditor, pos, Object.assign({}, current.attrs, patch));
          }

          // Attributs COURANTS - jamais `node.attrs` directement : ce paramètre de closure ne reflète que le premier rendu de cette NodeView, seul
          // `update(updatedNode)` reçoit le nœud frais.
          function currentAttrs() {
            const pos = getPos();
            const current = typeof pos === 'number' ? nodeEditor.state.doc.nodeAt(pos) : null;
            return (current && current.attrs) || node.attrs;
          }

          let resizeState = null;
          function startResize(event, corner) {
            event.preventDefault(); event.stopPropagation();
            const rect = img.getBoundingClientRect();
            const attrsNow = currentAttrs();
            resizeState = {
              startX: event.clientX, startY: event.clientY,
              startWidth: rect.width, startHeight: rect.height,
              signX: corner.includes('w') ? -1 : 1, signY: corner.includes('n') ? -1 : 1,
              isVarBox: !!attrsNow.varTable,
              // En calque, `wrap` a une largeur explicite (cf. applyAttrs) ; sans la faire grandir aussi pendant le glisser (pas seulement à la fin),
              // `.editor-image { max-width:100% }` plafonnerait l'<img> à l'ancienne largeur du wrap.
              isLayered: attrsNow.layer !== 'normal',
            };
            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeUp, { once: true });
          }
          function onResizeMove(event) {
            if (!resizeState) return;
            let width = Math.max(30, resizeState.startWidth + (event.clientX - resizeState.startX) * resizeState.signX);
            // En en-tête/pied, la poignée bute sur le plafond mais reste utilisable (rétrécir reste toujours libre).
            width = HeaderFooterPreview.clampWidthForHfMaxSize(width, img.naturalWidth, img.naturalHeight);
            img.style.width = Math.round(width) + 'px';
            if (resizeState.isLayered) wrap.style.width = Math.round(width) + 'px';
            if (resizeState.isVarBox) {
              const height = Math.max(30, resizeState.startHeight + (event.clientY - resizeState.startY) * resizeState.signY);
              img.style.height = Math.round(height) + 'px';
            }
          }
          function onResizeUp() {
            document.removeEventListener('mousemove', onResizeMove);
            if (resizeState) {
              const patch = { width: Math.round(img.getBoundingClientRect().width) + 'px' };
              if (resizeState.isVarBox) patch.height = Math.round(img.getBoundingClientRect().height) + 'px';
              updateAttrs(patch);
            }
            resizeState = null;
          }

          let moveState = null;
          function startMove(event) {
            event.preventDefault(); event.stopPropagation();
            // Attributs courants via getPos()/nodeAt, pas `node` (figé au 1er rendu).
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
              // `wrap` porte déjà la position finale (onMoveMove l'a suivie en direct pendant le glisser) - mesurable immédiatement, même schéma que
              // setLayer/alignOrSnap : c'est cette grille page, pas left/top, que pdf-export.js utilise pour garantir un rendu identique éditeur/PDF.
              const grid = HeaderFooterPreview.computePageGridPosition(wrap);
              // Lu APRÈS computePageGridPosition (pas recalculé depuis event.clientX/Y) : cette fonction repositionne `wrap` si le glisser sort de la page
              // physique (cf. son propre commentaire) - offsetLeft/offsetTop reflètent alors la position CORRIGÉE, jamais désynchronisée de la grille.
              const patch = { left: Math.round(wrap.offsetLeft), top: Math.round(wrap.offsetTop) };
              if (grid) Object.assign(patch, grid);
              updateAttrs(patch);
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

  // Saut de page forcé - nœud atome de bloc.
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

  // Numérotation des titres - configuration persistée comme un nœud dans le contenu plutôt qu'une colonne Grist séparée (évite une migration de schéma).
  // Attribut nommé `numberingStyle` pas `style` (collision HTML).
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
          // Un seul nœud de config par document : cherche parmi les enfants directs (doc.forEach), sinon l'insère en tête. `dispatch` peut être absent (mode
          // "can-run") - ne muter `tr` que s'il est présent.
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

  // Sommaire - nœud atome de bloc. Le HTML sérialisé reste un placeholder statique (résolu par reader-mode.js/pdf-export.js) ; l'éditeur affiche un aperçu
  // vivant via un NodeView, isolé du modèle par `ignoreMutation`.
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
            if (!headingEls.length) { dom.textContent = I18n.t('toc.placeholder'); return; }
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


  return {
    createVarBadgeNode, createPageNumberBadgeNode, createSmartChipNode, createFootnoteRefNode, createCommentMark,
    createFontSizeExtension, createTextColorExtension, createHighlightExtension,
    createBulletStyleExtension, createOrderedListStyleExtension, createTaskListStyleExtension,
    withCellBackground, createTabNavigationExtension, createClearHistoryExtension,
    createTwoColumnsNodes, createEditorImageNode, createPageBreakNode,
    createHeadingNumberingConfigNode, createTocNode,
  };
})();
