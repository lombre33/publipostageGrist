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

  // Coupe le libellé d'une bulle en un DÉBUT et une FIN, pour qu'une case de tableau ou une colonne de zone 2 colonnes trop étroite tronque le MILIEU du nom
  // (« #Projets.Det…Fonctionnement » plutôt que « #Projets.Details_depense_s_Fonc… ») : ce qui identifie une variable, c'est sa table au début et sa colonne au
  // bout. La fin est le dernier mot du nom en entier (« Fonctionnement », « Email ») complété des mots qui le précèdent tant qu'elle reste courte
  // (« du_client », « s_Personnel ») ; un dernier mot trop long est coupé à ses derniers caractères. C'est la case qui dit ensuite combien de cette fin se voit
  // (css/variable-actions.css : elle se coupe par la gauche, jamais par la droite, donc le bout du nom reste lisible). Un nom court n'est pas coupé.
  const BADGE_TAIL_MAX = 12;
  const BADGE_LAST_WORD_MAX = 16;
  function splitBadgeLabel(label) {
    if (label.length <= BADGE_TAIL_MAX + 4) return { head: label, tail: '' };
    // Les mots du nom, chacun suivi de son séparateur (_ . - espace) : « #Projets. », « Details_ », « depense_ », « s_ », « Fonctionnement ».
    const words = label.match(/[^_.\s-]*[_.\s-]*/g).filter(Boolean);
    let tail = words.length > 1 ? words[words.length - 1] : label;
    if (tail.length > BADGE_LAST_WORD_MAX) tail = tail.slice(-BADGE_TAIL_MAX);
    // Le premier mot (la table) reste toujours dans le début.
    for (let i = words.length - 2; i >= 1 && (words[i] + tail).length <= BADGE_TAIL_MAX; i--) tail = words[i] + tail;
    return { head: label.slice(0, label.length - tail.length), tail };
  }

  // Vue de l'éditeur d'une bulle (variable ou calcul) : le texte de la bulle y est coupé en deux morceaux (début / fin) pour qu'une case de tableau ou une colonne de zone 2
  // colonnes trop étroite tronque le MILIEU du nom avec « … » (css/variable-actions.css, css/variable-calc.css) au lieu de laisser la bulle traverser la case. Mêmes attributs et
  // même texte que renderHTML (badgeSpec), donc getHTML(), le presse-papiers et les exports gardent le nom entier dans un seul texte, et textContent le rend entier aux lecteurs
  // d'écran. `prefix` : la classe de la bulle ('var-badge' ou 'calc-badge'), qui nomme aussi celles du début (-head) et de la fin (-tail) et l'état cassé (-broken).
  function splitBadgeView(spec, prefix) {
    const [, attrs, label] = spec;
    const dom = document.createElement('span');
    Object.keys(attrs).forEach(name => { if (attrs[name] != null) dom.setAttribute(name, attrs[name]); });
    const parts = splitBadgeLabel(label);
    const head = document.createElement('span');
    head.className = prefix + '-head';
    head.textContent = parts.head;
    dom.appendChild(head);
    let tail = null;
    let tailText = null;
    if (parts.tail) {
      // La fin est dans une boîte qui la cale à droite : quand la case ou la colonne est trop étroite, c'est son début qui est rogné (css/variable-actions.css).
      tail = document.createElement('span');
      tail.className = prefix + '-tail';
      tailText = document.createElement('span');
      tailText.textContent = parts.tail;
      tail.appendChild(tailText);
      dom.appendChild(tail);
    }
    // Nom coupé par la case ou la colonne : le nom entier en info-bulle, posé au survol seulement quand il est vraiment coupé (une bulle cassée garde son message,
    // posé par Editor.refreshVariableBadgeValidity, qui retire aussi ce titre à chaque mise à jour du document). La fin se coupe par la gauche, ce que
    // scrollWidth ne compte pas : on compare les rectangles.
    dom.addEventListener('mouseenter', () => {
      if (dom.classList.contains(prefix + '-broken')) return;
      const cut = head.scrollWidth > head.clientWidth || (tail && tailText.getBoundingClientRect().width > tail.getBoundingClientRect().width + 0.5);
      if (cut) dom.title = label;
      else if (dom.title === label) dom.removeAttribute('title');
    });
    return { dom };
  }

  // Badge de variable #Variable — nœud "atome" en ligne, non éditable au caractère près (contenteditable="false") : <span class="var-badge" data-table
  // data-column data-key>, reconnu tel quel par reader-mode.js/pdf-export.js.
  function createVarBadgeNode(Node, mergeAttributes) {
    // Spécification DOM de la bulle, une seule pour renderHTML (HTML enregistré, presse-papiers, exports) et pour la vue de l'éditeur (addNodeView).
    function badgeSpec(HTMLAttributes, node) {
      const attrs = mergeAttributes(HTMLAttributes, {
        class: 'var-badge', contenteditable: 'false',
        'data-table': node.attrs.table, 'data-column': node.attrs.column, 'data-key': node.attrs.key,
      });
      if (node.attrs.format) attrs['data-format'] = JSON.stringify(node.attrs.format);
      if (node.attrs.condition) attrs['data-condition'] = JSON.stringify(node.attrs.condition);
      // `data-loop-repeat` à part : les repères de la zone répétée (css/variable-actions.css) la trouvent par sélecteur, sans lire le JSON.
      if (node.attrs.loop) { attrs['data-loop'] = JSON.stringify(node.attrs.loop); attrs['data-loop-repeat'] = node.attrs.loop.repeat || 'inline'; }
      // Préfixe décoratif régénéré à chaque rendu (jamais stocké) : suit la touche de déclenchement configurée, rétroactif sans migration.
      return ['span', attrs, varBadgeTriggerChar() + node.attrs.key];
    }
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
        // `condition` : { mode:'all'|'any', rules:[{ column, operator, value }] } - condition d'affichage (js/variable-condition.js), évaluée en lecture et
        // à l'export par js/reader-mode.js ; `null` = toujours affichée.
        // `loop` : { table, via, repeat, filter, sort, empty, … } - boucle sur les lignes liées (js/variable-loop.js), déroulée en lecture et à l'export par
        // js/loop-rules.js ; `repeat` dit ce qui se répète autour de la bulle (sa ligne de tableau, son élément de liste, son paragraphe, ou elle seule).
        return { table: noBareRender, column: noBareRender, key: noBareRender, format: noBareRender, condition: noBareRender, loop: noBareRender };
      },
      parseHTML() {
        return [{
          tag: 'span.var-badge',
          getAttrs: el => {
            const parseJsonAttr = name => {
              const raw = el.getAttribute(name);
              if (!raw) return null;
              try { return JSON.parse(raw); } catch (e) { return null; }
            };
            return {
              table: el.getAttribute('data-table'), column: el.getAttribute('data-column'), key: el.getAttribute('data-key'),
              format: parseJsonAttr('data-format'), condition: parseJsonAttr('data-condition'), loop: parseJsonAttr('data-loop'),
            };
          },
        }];
      },
      renderHTML({ HTMLAttributes, node }) {
        return badgeSpec(HTMLAttributes, node);
      },
      // Vue de l'éditeur SEULEMENT : cf. splitBadgeView. Pas de `update` : ProseMirror garde la vue tant que le nœud est identique et la refait sinon, comme il le faisait
      // avec renderHTML.
      addNodeView() {
        return ({ node, HTMLAttributes }) => splitBadgeView(badgeSpec(HTMLAttributes, node), 'var-badge');
      },
    });
  }

  // Bulle « Calcul » (js/variable-calc.js) : une FORMULE à la place d'une colonne, posée depuis la ligne « Calcul » du menu des variables (onglet Chips). Atome en ligne comme
  // varBadge ; `formula` est l'écriture enregistrée de js/formula.js (variables {Table.Colonne}, décimales au point, noms de fonction anglais), jamais le texte saisi : la même
  // formule se relit dans la langue de l'interface et avec la touche de déclenchement du moment. `format` : le réglage nombre de la barre flottante, comme une bulle de colonne
  // numérique. Vert comme les chips (« valeur calculée, pas une colonne Grist »). Résolue en lecture et à l'export par js/reader-mode.js, avec la ligne du tour dans une zone répétée.
  function createCalcBadgeNode(Node, mergeAttributes) {
    // Le texte de la bulle : « = » puis la formule dans l'écriture saisie, × ÷ − à la place de * / - (régénéré à chaque rendu, jamais stocké).
    function calcLabel(formula) {
      return '= ' + Formula.toDisplay(formula, { trigger: varBadgeTriggerChar(), lang: I18n.getLang(), pretty: true });
    }
    function badgeSpec(HTMLAttributes, node) {
      const attrs = mergeAttributes(HTMLAttributes, { class: 'calc-badge', contenteditable: 'false', 'data-formula': node.attrs.formula || '' });
      if (node.attrs.format) attrs['data-format'] = JSON.stringify(node.attrs.format);
      return ['span', attrs, calcLabel(node.attrs.formula)];
    }
    return Node.create({
      name: 'calcBadge',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        const noBareRender = { default: null, renderHTML: () => ({}) };
        return { formula: { default: '', renderHTML: () => ({}) }, format: noBareRender };
      },
      parseHTML() {
        return [{
          tag: 'span.calc-badge',
          getAttrs: el => {
            let format = null;
            try { format = JSON.parse(el.getAttribute('data-format') || 'null'); } catch (e) { format = null; }
            return { formula: el.getAttribute('data-formula') || '', format };
          },
        }];
      },
      renderHTML({ HTMLAttributes, node }) {
        return badgeSpec(HTMLAttributes, node);
      },
      // Même vue que celle d'une bulle de variable (début / fin, cf. splitBadgeView), et un double-clic ouvre le calcul : la barre flottante a le même bouton.
      addNodeView() {
        return ({ node, editor, getPos, HTMLAttributes }) => {
          const view = splitBadgeView(badgeSpec(HTMLAttributes, node), 'calc-badge');
          view.dom.addEventListener('dblclick', event => {
            const pos = typeof getPos === 'function' ? getPos() : null;
            if (pos == null || !editor.isEditable) return;
            event.preventDefault();
            VariableCalc.openAt(editor, pos);
          });
          return view;
        };
      },
    });
  }

  // Entrée sur une bulle « Calcul » sélectionnée ouvre son calcul (sans elle, TipTap couperait le paragraphe devant la bulle). Dans une extension à part, de priorité haute,
  // pour passer avant les touches de base sans changer l'ordre des nœuds du schéma (même précédent : js/grid-editor.js).
  function createCalcBadgeKeysExtension(Extension) {
    return Extension.create({
      name: 'calcBadgeKeys',
      priority: 1000,
      addKeyboardShortcuts() {
        return {
          Enter: ({ editor }) => {
            const picked = editor.state.selection.node;
            if (!picked || picked.type.name !== 'calcBadge' || !editor.isEditable) return false;
            VariableCalc.openAt(editor, editor.state.selection.from);
            return true;
          },
        };
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

  // Bloc de texte conditionnel (menu des variables, onglet Chips) : un conteneur de blocs - paragraphes mis en forme, titres, listes, tableaux et d'autres blocs
  // conditionnels, à toute profondeur - qui n'apparaît en lecture et à l'export que si sa condition d'affichage est remplie (js/conditional-text.js). Même condition
  // que celle d'une bulle ({ mode, rules }, fenêtre js/variable-condition.js, barre flottante js/floating-toolbars.js) ; sans condition, le bloc est toujours affiché.
  // Le cadre et l'étiquette « Si … » n'existent que dans l'éditeur (NodeView) : renderHTML, donc l'enregistrement, le presse-papiers et les exports, ne sérialise
  // que <div class="conditional-text" data-condition>, que le rendu défait (condition remplie) ou retire (sinon).
  function createConditionalTextNode(Node, mergeAttributes) {
    // Les étiquettes d'un changement de langue : une seule écoute pour toutes les vues (I18n.onChange ne se désabonne pas), chaque vue s'inscrit tant qu'elle vit.
    const views = new Set();
    I18n.onChange(() => views.forEach(refresh => refresh()));
    return Node.create({
      name: 'conditionalText',
      group: 'block',
      content: 'block+',
      // Le premier paragraphe d'un bloc qu'on vide ou qu'on colle ailleurs garde son bloc autour de lui, comme une citation.
      defining: true,
      addAttributes() {
        return { condition: { default: null, renderHTML: () => ({}) } };
      },
      parseHTML() {
        return [{
          tag: 'div.conditional-text',
          getAttrs: el => {
            const raw = el.getAttribute('data-condition');
            if (!raw) return { condition: null };
            try { return { condition: JSON.parse(raw) }; } catch (e) { return { condition: null }; }
          },
        }];
      },
      renderHTML({ HTMLAttributes, node }) {
        const attrs = mergeAttributes(HTMLAttributes, { class: 'conditional-text' });
        if (node.attrs.condition) attrs['data-condition'] = JSON.stringify(node.attrs.condition);
        return ['div', attrs, 0];
      },
      // Vue de l'éditeur SEULEMENT. L'étiquette est hors du contentDOM (jamais lue comme contenu du bloc) ; un clic dessus sélectionne le bloc entier - un
      // conteneur ne se sélectionne pas d'un clic simple - ce qui ouvre sa barre flottante (js/floating-toolbars.js:wireVariableFloatingToolbar).
      addNodeView() {
        return ({ node: initialNode, editor: nodeEditor, getPos }) => {
          let node = initialNode;
          const dom = document.createElement('div');
          dom.className = 'conditional-text';
          const tag = document.createElement('div');
          tag.className = 'conditional-text-tag';
          tag.contentEditable = 'false';
          tag.setAttribute('role', 'button');
          const contentDOM = document.createElement('div');
          contentDOM.className = 'conditional-text-content';
          dom.append(tag, contentDOM);
          function refresh() {
            const condition = ConditionRules.normalizeCondition(node.attrs.condition);
            if (node.attrs.condition) dom.setAttribute('data-condition', JSON.stringify(node.attrs.condition)); else dom.removeAttribute('data-condition');
            dom.classList.toggle('has-condition', !!condition);
            // Le texte entier de la condition va dans l'info-bulle : l'étiquette, elle, se coupe par « … » si elle dépasse la largeur du bloc.
            const summary = condition ? VariableCondition.describe(condition, { full: true }) : '';
            tag.textContent = condition ? I18n.t('condText.tag.if', { condition: summary }) : I18n.t('condText.tag.none');
            const title = condition ? I18n.t('condText.tag.titleIf', { condition: summary }) : I18n.t('condText.tag.titleNone');
            tag.title = title;
            tag.setAttribute('aria-label', title);
          }
          refresh();
          views.add(refresh);
          tag.addEventListener('mousedown', event => {
            event.preventDefault(); event.stopPropagation();
            const pos = getPos();
            if (typeof pos === 'number') nodeEditor.chain().focus().setNodeSelection(pos).run();
          });
          // Un clic dans le texte d'un bloc resté sélectionné (la fenêtre de condition se referme sur lui) ne déplaçait pas la sélection : le bloc sélectionné est déplaçable
          // à la souris, et Chrome ne pose pas le curseur dans ce qui peut être glissé - ProseMirror ne le rattrape qu'à deux positions de la fin du bloc. Le cadre épousant
          // son texte, la marge vide à droite de la ligne, qui y échappait, n'existe plus : le clic pose le curseur là où il tombe. Une bulle, une image, l'étiquette gardent
          // leur propre clic.
          dom.addEventListener('click', event => {
            if (!dom.classList.contains('conditional-text-selected') || event.target.closest('[contenteditable="false"], .editor-image-view, hr')) return;
            const hit = nodeEditor.view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!hit || !nodeEditor.state.doc.resolve(hit.pos).parent.inlineContent) return;
            nodeEditor.commands.setTextSelection(hit.pos);
            nodeEditor.view.focus();
          });
          return {
            dom,
            contentDOM,
            update: updatedNode => {
              if (updatedNode.type !== node.type) return false;
              node = updatedNode;
              refresh();
              return true;
            },
            // Le bloc sélectionné (clic sur son étiquette) porte sa propre classe, comme l'image (editor-image-selected) ; ProseMirror, pour un conteneur sélectionné,
            // le rend aussi déplaçable à la souris - on garde ce comportement.
            selectNode: () => { dom.classList.add('conditional-text-selected'); dom.draggable = true; },
            deselectNode: () => { dom.classList.remove('conditional-text-selected'); dom.removeAttribute('draggable'); },
            // L'étiquette et les attributs du cadre sont posés hors transaction : ProseMirror ne doit pas les lire comme une modification du document.
            ignoreMutation: mutation => mutation.type !== 'selection' && (tag.contains(mutation.target) || mutation.target === dom),
            stopEvent: event => tag.contains(event.target),
            destroy: () => views.delete(refresh),
          };
        };
      },
    });
  }

  // Case conditionnelle (menu des variables, onglet Chips ; demande d'Antoine du 01/10) : une puce en ligne qui se lit comme une case cochée quand sa condition est remplie, décochée sinon
  // (js/conditional-checkbox.js). Même condition que celle d'une bulle ou d'un bloc de texte ({ mode, rules }, fenêtre js/variable-condition.js, barre flottante
  // js/floating-toolbars.js) ; `style` : l'un des trois styles de case de la liste à cases (VariableFormat.BOOL_CHECKBOX_STYLES). Dans l'éditeur la puce montre sa case décochée, dessinée
  // comme à la Lecture (la classe `.resolved-checkbox`), et « Si Statut = Urgent » (ou « sans condition ») ; renderHTML, donc l'enregistrement, le presse-papiers et les exports,
  // ne sérialise que <span class="conditional-checkbox" data-condition data-checkbox-style>, que le rendu remplace par la case cochée ou non.
  function createConditionalCheckboxNode(Node, mergeAttributes) {
    // Les libellés d'un changement de langue : une seule écoute pour toutes les vues (I18n.onChange ne se désabonne pas), chaque vue s'inscrit tant qu'elle vit.
    const views = new Set();
    I18n.onChange(() => views.forEach(refresh => refresh()));
    function attrsOf(HTMLAttributes, node) {
      const attrs = mergeAttributes(HTMLAttributes, { class: 'conditional-checkbox', contenteditable: 'false', 'data-checkbox-style': ConditionalCheckbox.styleOf(node.attrs.style) });
      if (node.attrs.condition) attrs['data-condition'] = JSON.stringify(node.attrs.condition);
      return attrs;
    }
    return Node.create({
      name: 'conditionalCheckbox',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      addAttributes() {
        return {
          condition: { default: null, renderHTML: () => ({}) },
          style: { default: ConditionalCheckbox.DEFAULT_STYLE, renderHTML: () => ({}) },
        };
      },
      parseHTML() {
        return [{
          tag: 'span.conditional-checkbox',
          getAttrs: el => {
            let condition = null;
            try { condition = JSON.parse(el.getAttribute('data-condition') || 'null'); } catch (e) { condition = null; }
            return { condition, style: ConditionalCheckbox.styleOf(el.getAttribute('data-checkbox-style')) };
          },
        }];
      },
      renderHTML({ HTMLAttributes, node }) {
        return ['span', attrsOf(HTMLAttributes, node), VariableFormat.UNCHECKED_BOX];
      },
      // Vue de l'éditeur SEULEMENT : la case dessinée, puis le libellé de la condition (coupé par « … » quand la case ou la colonne qui le porte est trop étroite, css/conditional-checkbox.css) ;
      // le texte entier est dans son info-bulle et dans son nom accessible. Pas de `update` : ProseMirror garde la vue tant que le nœud est identique et la refait sinon.
      addNodeView() {
        return ({ node, HTMLAttributes }) => {
          const attrs = attrsOf(HTMLAttributes, node);
          const dom = document.createElement('span');
          Object.keys(attrs).forEach(name => { if (attrs[name] != null) dom.setAttribute(name, attrs[name]); });
          // Comme l'étiquette d'un bloc de texte conditionnel : sans rôle, l'`aria-label` d'un simple <span> n'est pas lu.
          dom.setAttribute('role', 'button');
          const style = ConditionalCheckbox.styleOf(node.attrs.style);
          const box = document.createElement('span');
          box.className = 'resolved-checkbox';
          box.setAttribute('data-checked', 'false');
          box.setAttribute('data-checkbox-style', style);
          box.setAttribute('aria-hidden', 'true');
          box.style.color = VariableFormat.checkboxColor(false, style);
          box.textContent = VariableFormat.UNCHECKED_BOX;
          // Le libellé en deux morceaux, comme une bulle (splitBadgeLabel) : trop long pour sa case ou sa colonne, c'est son MILIEU que « … » remplace, jamais le bout (css/conditional-checkbox.css).
          const head = document.createElement('span');
          head.className = 'conditional-checkbox-head';
          const tail = document.createElement('span');
          tail.className = 'conditional-checkbox-tail';
          const tailText = document.createElement('span');
          tail.appendChild(tailText);
          dom.append(box, head, tail);
          const condition = ConditionRules.normalizeCondition(node.attrs.condition);
          dom.classList.toggle('has-condition', !!condition);
          function refresh() {
            const summary = condition ? VariableCondition.describe(condition, { full: true }) : '';
            const parts = splitBadgeLabel(condition ? I18n.t('condCheckbox.tag.if', { condition: summary }) : I18n.t('condCheckbox.tag.none'));
            head.textContent = parts.head;
            tailText.textContent = parts.tail;
            tail.hidden = !parts.tail;
            const title = condition ? I18n.t('condCheckbox.tag.titleIf', { condition: summary }) : I18n.t('condCheckbox.tag.titleNone');
            dom.title = title;
            dom.setAttribute('aria-label', title);
          }
          refresh();
          views.add(refresh);
          return { dom, destroy: () => views.delete(refresh) };
        };
      },
    });
  }

  // Écrit la nouvelle position d'une image en calque que la personne vient de DÉPLACER : une seule voie pour le glisser de la NodeView (`onMoveUp`) et les flèches du clavier
  // (`nudgeSelectedImage`, js/floating-toolbars.js). `patch` : left, top et la grille page (pageIndex, pageLeftPt, pageTopPt). Rend true si le document a changé.
  // Rien ne s'écrit quand aucune valeur ne change (un simple clic sur l'image déjà sélectionnée, une flèche contre le bord de la page) : ni étape d'historique, ni suggestion.
  // Suivi des modifications actif (choix d'Antoine, 01/10 : « le déplacement d'une image laisse une trace, quel que soit le mode de déplacement »), l'écriture est SUIVIE : la
  // bibliothèque laisse l'image d'origine à sa place en suppression suggérée et pose la copie à la nouvelle position en insertion suggérée (accepter garde la copie, refuser rend
  // l'original). Elle ne garde pas la sélection : la copie est resélectionnée, sinon la flèche suivante ferait avancer le curseur et la barre de l'image se fermerait. Une image DÉJÀ
  // insérée par une suggestion (la copie du premier appui d'une rafale, d'un déplacement précédent) se déplace en place, hors suivi : sa suggestion couvre déjà sa position, et une
  // trace par appui empilerait les copies. Une image en suppression suggérée ne bouge pas : elle attend d'être acceptée ou refusée.
  function moveImageNode(editor, pos, patch) {
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'editorImage') return false;
    const before = node.attrs;
    const changed = Object.keys(patch).some(key => (patch[key] == null || before[key] == null) ? patch[key] !== before[key] : Math.abs(patch[key] - before[key]) > 0.005);
    if (!changed) return false;
    const marked = (n, name) => !!n && n.marks.some(m => m.type.name === name);
    if (marked(node, 'deletion')) return false;
    const attrs = Object.assign({}, before, patch);
    if (Editor.isTrackChangesOn() && !marked(node, 'insertion')) {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs));
      const doc = editor.state.doc;
      const first = doc.nodeAt(pos);
      const copyPos = marked(first, 'insertion') ? pos : (first && marked(doc.nodeAt(pos + first.nodeSize), 'insertion') ? pos + first.nodeSize : -1);
      if (copyPos >= 0) editor.commands.setNodeSelection(copyPos);
      return true;
    }
    // Sans suivi, ou sur une image déjà insérée : le nœud est remplacé (setNodeMarkup) et la NodeSelection recréée dessus dans la MÊME transaction (cf. EditorCore.patchNodeAndReselect),
    // avec la classe de la sélection courante - d'abord posée sur l'image si ce n'était pas elle (glisser par la poignée d'une image non sélectionnée).
    if (!editor.state.selection.node) editor.commands.setNodeSelection(pos);
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, attrs);
    tr.setSelection(editor.state.selection.constructor.create(tr.doc, pos));
    editor.view.dispatch(TrackChanges.skipTracking(tr));
    return true;
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
      // QR code sans image (une colonne dans son texte, js/qr-code.js) : un cadre carré, quelle que soit la largeur.
      if (a.qrText && !a.src) parts.push('aspect-ratio: 1 / 1');
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
          // « Sur toutes les pages » (js/page-layer.js) : l'image « derrière le texte » est peinte à la même place de chaque page. Posé par la barre flottante, effacé dès que
          // l'image quitte « derrière le texte » ; sans grille page il ne produit rien (PageLayer.isRepeatedAttrs).
          repeat: { default: false, parseHTML: el => el.getAttribute('data-repeat') === 'true', renderHTML: noBareRender },
          // Posés ensemble : transforment ce nœud en placeholder de #Variable Attachments (jamais de vraie image dans l'éditeur).
          varTable: { default: null, parseHTML: el => el.getAttribute('data-var-table') || null, renderHTML: noBareRender },
          varColumn: { default: null, parseHTML: el => el.getAttribute('data-var-column') || null, renderHTML: noBareRender },
          varKey: { default: null, parseHTML: el => el.getAttribute('data-var-key') || null, renderHTML: noBareRender },
          // QR code (js/qr-code.js) : le texte à encoder, « #Table.Colonne » compris. Posé avec un `src`, l'image est le QR code déjà dessiné ; sans `src`, le texte contient une
          // colonne et le QR code n'est dessiné qu'à la Lecture et à l'export, pour la ligne affichée (reader-mode.js:resolveQrCodes).
          qrText: { default: null, parseHTML: el => el.getAttribute('data-qr-text') || null, renderHTML: noBareRender },
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
        if (a.repeat) attrs['data-repeat'] = 'true';
        if (a.varTable) {
          attrs['data-var-table'] = a.varTable;
          attrs['data-var-column'] = a.varColumn;
          attrs['data-var-key'] = a.varKey;
        }
        if (a.qrText) attrs['data-qr-text'] = a.qrText;
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
            // Un QR code dont le texte contient une colonne : le même cadre qu'une image de variable, carré, avec son texte pour libellé.
            const isQrBox = !!attrs.qrText && !attrs.src && !isVarBox;
            img.src = isVarBox ? '' : (attrs.src || '');
            img.alt = attrs.alt || '';
            const imgStyle = [];
            if (attrs.width) imgStyle.push(`width: ${attrs.width}`);
            if (isVarBox && attrs.height) imgStyle.push(`height: ${attrs.height}`);
            if (isQrBox) imgStyle.push('aspect-ratio: 1 / 1');
            if (attrs.opacity !== 1 && attrs.opacity != null) imgStyle.push(`opacity: ${attrs.opacity}`);
            if (attrs.layer !== 'normal') imgStyle.push('position: relative', `z-index: ${attrs.layer === 'front' ? 5 : -1}`);
            img.setAttribute('style', imgStyle.join('; '));
            wrap.classList.toggle('editor-image-var-placeholder', isVarBox || isQrBox);
            wrap.classList.toggle('editor-image-qr-placeholder', isQrBox);
            varLabel.textContent = isVarBox ? ('#' + (attrs.varKey || '')) : (isQrBox ? attrs.qrText : '');
            const layered = attrs.layer !== 'normal';
            wrap.classList.toggle('editor-image-layered', layered);
            wrap.classList.toggle('editor-image-repeated', PageLayer.isRepeatedAttrs(attrs));
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
            // La souris et getBoundingClientRect parlent en pixels ÉCRAN, `width`/`height` s'écrivent en pixels de MISE EN PAGE : la feuille est réduite à ~0,85 dans
            // un panneau de ~700 px (cf. EditorCore.layoutZoom). Sans cette conversion, agrandir de 100 px rétrécissait l'image.
            const zoom = EditorCore.layoutZoom(wrap);
            resizeState = {
              startX: event.clientX, startY: event.clientY, zoom,
              startWidth: rect.width / zoom, startHeight: rect.height / zoom,
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
            let width = Math.max(30, resizeState.startWidth + ((event.clientX - resizeState.startX) / resizeState.zoom) * resizeState.signX);
            // En en-tête/pied, la poignée bute sur le plafond mais reste utilisable (rétrécir reste toujours libre).
            width = HeaderFooterPreview.clampWidthForHfMaxSize(width, img.naturalWidth, img.naturalHeight);
            img.style.width = Math.round(width) + 'px';
            if (resizeState.isLayered) wrap.style.width = Math.round(width) + 'px';
            if (resizeState.isVarBox) {
              const height = Math.max(30, resizeState.startHeight + ((event.clientY - resizeState.startY) / resizeState.zoom) * resizeState.signY);
              img.style.height = Math.round(height) + 'px';
            }
          }
          function onResizeUp() {
            document.removeEventListener('mousemove', onResizeMove);
            if (resizeState) {
              const patch = { width: Math.round(img.getBoundingClientRect().width / resizeState.zoom) + 'px' };
              if (resizeState.isVarBox) patch.height = Math.round(img.getBoundingClientRect().height / resizeState.zoom) + 'px';
              updateAttrs(patch);
            }
            resizeState = null;
          }

          let moveState = null;
          function startMove(event) {
            // Attributs courants via getPos()/nodeAt, pas `node` (figé au 1er rendu).
            const pos = getPos();
            const current = (typeof pos === 'number' && nodeEditor.state.doc.nodeAt(pos)) || node;
            // Une image en suppression suggérée (l'original d'un déplacement suivi) attend d'être acceptée ou refusée : elle ne se glisse pas, le clic reste un clic.
            if (current.marks.some(m => m.type.name === 'deletion')) return;
            event.preventDefault(); event.stopPropagation();
            // Déplacement de la souris en pixels écran, `left`/`top` en pixels de mise en page (cf. startResize) : sans la division, l'image traînait derrière le pointeur.
            moveState = { startX: event.clientX, startY: event.clientY, zoom: EditorCore.layoutZoom(wrap), startLeft: current.attrs.left || 0, startTop: current.attrs.top || 0 };
            document.addEventListener('mousemove', onMoveMove);
            document.addEventListener('mouseup', onMoveUp, { once: true });
          }
          function onMoveMove(event) {
            if (!moveState) return;
            wrap.style.left = (moveState.startLeft + (event.clientX - moveState.startX) / moveState.zoom) + 'px';
            wrap.style.top = (moveState.startTop + (event.clientY - moveState.startY) / moveState.zoom) + 'px';
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
              // Même voie que les flèches du clavier : en suivi, le déplacement laisse sa trace (l'original barré, la copie à la nouvelle place). Rien ne s'écrit sans changement (un simple
              // clic sur l'image déjà sélectionnée) ni sur une image en suppression suggérée : le DOM, que le glisser a déplacé en direct, retrouve alors la position du document.
              const pos = getPos();
              const current = typeof pos === 'number' ? nodeEditor.state.doc.nodeAt(pos) : null;
              if (current && !moveImageNode(nodeEditor, pos, patch)) applyAttrs(current.attrs);
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

  // Sommaire - nœud atome de bloc. Le HTML sérialisé reste un placeholder (résolu par reader-mode.js/pdf-export.js) ; l'éditeur affiche un aperçu vivant via
  // un NodeView, isolé du modèle par `ignoreMutation`. Le texte du placeholder suit la langue de l'interface (même clé que le NodeView) : il n'est lu par
  // personne au rechargement (`parseHTML` ne regarde que la classe), mais Ctrl+C le colle tel quel dans un autre document ou une autre application.
  function createTocNode(Node) {
    return Node.create({
      name: 'toc',
      group: 'block',
      atom: true,
      selectable: true,
      parseHTML() { return [{ tag: 'div.toc-marker' }]; },
      renderHTML() { return ['div', { class: 'toc-marker' }, I18n.t('toc.placeholder')]; },
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
    createVarBadgeNode, createCalcBadgeNode, createCalcBadgeKeysExtension, createPageNumberBadgeNode, createSmartChipNode, createFootnoteRefNode, createCommentMark,
    createFontSizeExtension, createTextColorExtension, createHighlightExtension,
    createBulletStyleExtension, createOrderedListStyleExtension, createTaskListStyleExtension,
    withCellBackground, createTabNavigationExtension, createClearHistoryExtension,
    createTwoColumnsNodes, createConditionalTextNode, createConditionalCheckboxNode, createEditorImageNode, moveImageNode, createPageBreakNode,
    createHeadingNumberingConfigNode, createTocNode,
  };
})();
