// Fabriques de nœuds et d'extensions TipTap personnalisés. Aucune ne ferme sur une référence d'éditeur partagée : chaque NodeView reçoit la sienne
// par le paramètre `({ node, editor, getPos })` que TipTap fournit à chaque rendu.
const EditorNodes = (function () {
  const { internalAttr, inlineAtom, jsonAttr, setAttrs, languageViews, liveNode } = (function () {
    // Aides communes : attributs internes, atomes en ligne, lecture JSON, attributs DOM, vues qui suivent la langue, nœud vivant

    // Un attribut gardé dans le JSON du nœud, jamais rendu en attribut HTML : sans `renderHTML` vide, TipTap écrirait aussi chaque attribut par défaut
    // en attribut nu (table="...") en plus des data-* posés à la main, un doublon.
    const internalAttr = defaultValue => ({ default: defaultValue, renderHTML: () => ({}) });
    // Nœud atome en ligne et sélectionnable : une bulle, une puce, une note de bas de page, une image.
    const inlineAtom = (Node, config) => Node.create(Object.assign({ group: 'inline', inline: true, atom: true, selectable: true }, config));
    // L'objet qu'un attribut data-* porte en JSON (condition, format, boucle) ; null quand il est absent ou illisible.
    function jsonAttr(el, name) {
      const raw = el.getAttribute(name);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
    // Pose sur `dom` les attributs d'une spécification de rendu, sauf les null.
    function setAttrs(dom, attrs) {
      Object.keys(attrs).forEach(name => { if (attrs[name] != null) dom.setAttribute(name, attrs[name]); });
    }
    // Les vues qui réécrivent leurs textes au changement de langue : une seule écoute pour toutes (I18n.onChange ne se désabonne pas), chaque vue
    // s'inscrit tant qu'elle vit.
    function languageViews() {
      const views = new Set();
      I18n.onChange(() => views.forEach(refresh => refresh()));
      return views;
    }
    // Le nœud d'une NodeView tel que le document l'a maintenant, avec sa position ; null s'il n'y est plus. Jamais le `node` reçu au premier rendu :
    // seul `update` le rafraîchit.
    function liveNode(editor, getPos) {
      const pos = getPos();
      const node = typeof pos === 'number' ? editor.state.doc.nodeAt(pos) : null;
      return node ? { pos, node } : null;
    }
    return { internalAttr, inlineAtom, jsonAttr, setAttrs, languageViews, liveNode };
  })();

  const { splitBadgeLabel, splitBadgeView } = (function () {
    // Le libellé d'une bulle en deux morceaux

    // Coupe le libellé d'une bulle en un début et une fin, pour qu'une case de tableau ou une colonne de zone 2 colonnes trop étroite tronque le milieu
    // du nom (« #Projets.Det…Fonctionnement » plutôt que « #Projets.Details_depense_s_Fonc… ») : ce qui identifie une variable, c'est sa table au début
    // et sa colonne au bout. La fin est le dernier mot du nom en entier (« Fonctionnement », « Email ») complété des mots qui le précèdent tant qu'elle
    // reste courte (« du_client », « s_Personnel ») ; un dernier mot trop long est coupé à ses derniers caractères. C'est la case qui dit ensuite
    // combien de cette fin se voit (css/variable-actions.css : elle se coupe par la gauche, donc le bout du nom reste lisible). Un nom court n'est pas
    // coupé.
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

    // Vue de l'éditeur d'une bulle (variable ou calcul) : le texte est coupé en deux morceaux (début, fin) pour qu'une case de tableau ou une colonne
    // de zone 2 colonnes trop étroite tronque le milieu du nom avec « … » (css/variable-actions.css, css/variable-calc.css) au lieu de laisser la bulle
    // traverser la case. Mêmes attributs et même texte que renderHTML (badgeSpec) : getHTML(), le presse-papiers et les exports gardent le nom entier,
    // et textContent le rend entier aux lecteurs d'écran. `prefix` : la classe de la bulle ('var-badge' ou 'calc-badge'), qui nomme aussi celles du
    // début (-head), de la fin (-tail) et l'état cassé (-broken).
    function splitBadgeView(spec, prefix) {
      const [, attrs, label] = spec;
      const dom = document.createElement('span');
      setAttrs(dom, attrs);
      const parts = splitBadgeLabel(label);
      const head = document.createElement('span');
      head.className = prefix + '-head';
      head.textContent = parts.head;
      dom.appendChild(head);
      let tail = null;
      let tailText = null;
      if (parts.tail) {
        // La fin est dans une boîte qui la cale à droite : quand la case ou la colonne est trop étroite, c'est son début qui est rogné
        // (css/variable-actions.css).
        tail = document.createElement('span');
        tail.className = prefix + '-tail';
        tailText = document.createElement('span');
        tailText.textContent = parts.tail;
        tail.appendChild(tailText);
        dom.appendChild(tail);
      }
      // Nom coupé par la case ou la colonne : le nom entier en info-bulle, posé au survol seulement quand il est vraiment coupé (une bulle cassée garde
      // son message, posé par Editor.refreshVariableBadgeValidity, qui retire aussi ce titre à chaque mise à jour du document). La fin se coupe par la
      // gauche, ce que scrollWidth ne compte pas : on compare les rectangles.
      dom.addEventListener('mouseenter', () => {
        if (dom.classList.contains(prefix + '-broken')) return;
        const cut = head.scrollWidth > head.clientWidth || (tail && tailText.getBoundingClientRect().width > tail.getBoundingClientRect().width + 0.5);
        if (cut) dom.title = label;
        else if (dom.title === label) dom.removeAttribute('title');
      });
      return { dom };
    }
    return { splitBadgeLabel, splitBadgeView };
  })();

  const { createVarBadgeNode } = (function () {
    // La bulle de variable

    // Bulle de variable #Variable : nœud atome en ligne, non éditable au caractère près (contenteditable="false") : <span class="var-badge" data-table
    // data-column data-key>, reconnu tel quel par reader-mode.js et pdf-export.js.
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
        return ['span', attrs, Variables.triggerChar() + node.attrs.key];
      }
      return inlineAtom(Node, {
        name: 'varBadge',
        addAttributes() {
          // `format` : { type:'number', style, decimals, currency, words } ou { type:'date', preset }, choisi par la barre flottante (cf.
          // wireVariableFloatingToolbar) ; `null` tant que rien n'est réglé (valeur brute, String(val)).
          // `condition` : { mode:'all'|'any', rules:[{ column, operator, value }] } - condition d'affichage (js/variable-condition.js), évaluée en
          // lecture et à l'export par js/reader-mode.js ; `null` = toujours affichée.
          // `loop` : { table, via, repeat, filter, sort, empty, … } - boucle sur les lignes liées (js/variable-loop.js), déroulée en lecture et à
          // l'export par js/loop-rules.js ; `repeat` dit ce qui se répète autour de la bulle (sa ligne de tableau, son élément de liste, son
          // paragraphe, ou elle seule).
          return { table: internalAttr(null), column: internalAttr(null), key: internalAttr(null), format: internalAttr(null), condition: internalAttr(null), loop: internalAttr(null) };
        },
        parseHTML() {
          return [{
            tag: 'span.var-badge',
            getAttrs: el => ({
              table: el.getAttribute('data-table'), column: el.getAttribute('data-column'), key: el.getAttribute('data-key'),
              format: jsonAttr(el, 'data-format'), condition: jsonAttr(el, 'data-condition'), loop: jsonAttr(el, 'data-loop'),
            }),
          }];
        },
        renderHTML({ HTMLAttributes, node }) {
          return badgeSpec(HTMLAttributes, node);
        },
        // Vue de l'éditeur seulement : cf. splitBadgeView. Pas de `update` : ProseMirror garde la vue tant que le nœud est identique et la refait
        // sinon.
        addNodeView() {
          return ({ node, HTMLAttributes }) => splitBadgeView(badgeSpec(HTMLAttributes, node), 'var-badge');
        },
      });
    }
    return { createVarBadgeNode };
  })();

  const { createCalcBadgeNode, createCalcBadgeKeysExtension } = (function () {
    // La bulle de calcul et ses touches

    // Bulle « Calcul » (js/variable-calc.js) : une formule à la place d'une colonne, posée depuis la ligne « Calcul » du menu des variables (onglet
    // Chips). Atome en ligne comme varBadge ; `formula` est l'écriture enregistrée de js/formula.js (variables {Table.Colonne}, décimales au point,
    // noms de fonction anglais), jamais le texte saisi : la même formule se relit dans la langue de l'interface et avec la touche de déclenchement du
    // moment. `format` : le réglage nombre de la barre flottante, comme une bulle de colonne numérique. Verte comme les chips (« valeur calculée, pas
    // une colonne Grist »). Résolue en lecture et à l'export par js/reader-mode.js, avec la ligne du tour dans une zone répétée.
    function createCalcBadgeNode(Node, mergeAttributes) {
      // Le texte de la bulle : « = » puis la formule dans l'écriture saisie, × ÷ − à la place de * / - (régénéré à chaque rendu, jamais stocké).
      function calcLabel(formula) {
        return '= ' + Formula.toDisplay(formula, { trigger: Variables.triggerChar(), lang: I18n.getLang(), pretty: true });
      }
      function badgeSpec(HTMLAttributes, node) {
        const attrs = mergeAttributes(HTMLAttributes, { class: 'calc-badge', contenteditable: 'false', 'data-formula': node.attrs.formula || '' });
        if (node.attrs.format) attrs['data-format'] = JSON.stringify(node.attrs.format);
        return ['span', attrs, calcLabel(node.attrs.formula)];
      }
      return inlineAtom(Node, {
        name: 'calcBadge',
        addAttributes() {
          return { formula: internalAttr(''), format: internalAttr(null) };
        },
        parseHTML() {
          return [{ tag: 'span.calc-badge', getAttrs: el => ({ formula: el.getAttribute('data-formula') || '', format: jsonAttr(el, 'data-format') }) }];
        },
        renderHTML({ HTMLAttributes, node }) {
          return badgeSpec(HTMLAttributes, node);
        },
        // Même vue que celle d'une bulle de variable (début / fin, cf. splitBadgeView), et un double-clic ouvre le calcul : la barre flottante a le
        // même bouton.
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

    // Entrée sur une bulle « Calcul » sélectionnée ouvre son calcul (sans elle, TipTap couperait le paragraphe devant la bulle). Dans une extension à
    // part, de priorité haute, pour passer avant les touches de base sans changer l'ordre des nœuds du schéma (même précédent : js/grid-editor.js).
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
    return { createCalcBadgeNode, createCalcBadgeKeysExtension };
  })();

  const { createPageNumberBadgeNode, createSmartChipNode } = (function () {
    // La bulle de numéro de page et la puce intelligente

    // Bulle de numéro de page, même schéma que varBadge. Le libellé rendu dans l'éditeur n'est qu'un espace réservé (selon le format choisi), résolu en
    // vrai numéro seulement à l'export et dans l'aperçu paginé.
    function createPageNumberBadgeNode(Node, mergeAttributes) {
      const LABELS = { n: '#', 'page-n': 'Page #', 'n-slash-total': '#/#' };
      return inlineAtom(Node, {
        name: 'pageNumberBadge',
        addAttributes() {
          return { format: internalAttr('n') };
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

    // Chip intelligent (date, heure, email, nom), même schéma que varBadge. Jamais de vraie valeur dans l'éditeur (résolu en Lecture et à l'export, cf.
    // js/reader-mode.js:resolveSmartChips) ; vert plutôt que bleu pour signaler « valeur calculée, pas une colonne Grist ».
    function createSmartChipNode(Node, mergeAttributes) {
      const KIND_I18N_KEYS = { date: 'chips.date', time: 'chips.time', email: 'chips.email', name: 'chips.name' };
      function labelFor(kind) {
        const key = KIND_I18N_KEYS[kind];
        return key ? I18n.t(key) : '?';
      }
      return inlineAtom(Node, {
        name: 'smartChip',
        addAttributes() {
          return { kind: internalAttr('date') };
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
    return { createPageNumberBadgeNode, createSmartChipNode };
  })();

  const { createFootnoteRefNode, createCommentMark } = (function () {
    // La note de bas de page et la marque de commentaire

    // Note de bas de page : nœud atome portant son texte brut en attribut (`text`). La numérotation continue sur tout le document vient du seul
    // compteur CSS `footnote-ref` (css/editor-v2.css), jamais comptée en JS.
    function createFootnoteRefNode(Node, mergeAttributes) {
      return inlineAtom(Node, {
        name: 'footnoteRef',
        addAttributes() {
          return { id: internalAttr(null), text: internalAttr('') };
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
              // Pas de stopPropagation() : ProseMirror sélectionne ce nœud par un gestionnaire posé sur .tiptap (un ancêtre) ; le bloquer casserait la
              // sélection au clic, donc la suppression au clavier.
              const pos = getPos();
              if (typeof pos === 'number') Editor.openFootnoteEditorAt(pos);
            });
            return { dom: marker };
          };
        },
      });
    }

    // Commentaire : une marque, pas un nœud. Contrairement à une note de bas de page (un point unique), un commentaire s'attache à une portée de texte
    // existant, comme gras ou italique : ProseMirror la déplace, l'étend et la découpe au fil des modifications, sans code de suivi (cf. js/comments.js
    // pour le choix face à un vrai suivi de modifications). Le fil de discussion (auteur, texte, réponses) vit dans la table Grist
    // Publipostage_Commentaires (js/comments.js), seul un identifiant relie la portée à son fil. `resolved` vit ici, dans le document : c'est une
    // propriété de cette portée, pas du message échangé, et dans le document elle voyage avec le reste (enregistrement automatique, Annuler/Rétablir,
    // export) sans resynchronisation.
    // `excludes: ''` (au lieu du défaut, le nom de la marque) : sans cela, une deuxième marque commentaire (id différent) sur une portée qui chevauche
    // la première la ferait disparaître au lieu de les superposer ; deux fils indépendants doivent pouvoir coexister sur un chevauchement, comme dans
    // l'exemple officiel de ProseMirror.
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
    return { createFootnoteRefNode, createCommentMark };
  })();

  const {
    inlineStyleAttribute, createFontSizeExtension, createTextColorExtension, createHighlightExtension, createBulletStyleExtension,
    createOrderedListStyleExtension, createTaskListStyleExtension,
  } = (function () {
    // Les styles de texte et de liste

    // Un réglage de style en ligne (`attribute` : fontSize, color, backgroundColor) : lu sur le style de l'élément, rendu en `style="propriété:
    // valeur"`.
    function inlineStyleAttribute(attribute) {
      const property = attribute.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
      return {
        default: null,
        parseHTML: el => el.style[attribute] || null,
        renderHTML: attrs => (attrs[attribute] ? { style: `${property}: ${attrs[attribute]}` } : {}),
      };
    }
    // Augmente la marque 'textStyle' via addGlobalAttributes (comme FontFamily/Color officiels) - 'textStyle' doit être enregistrée à part (TextStyle,
    // câblée dans init()), sinon ProseMirror lève une erreur. `setter` et `unsetter` : les noms des commandes (une taille de police ne s'efface pas).
    function createTextStyleExtension(Extension, { name, attribute, setter, unsetter }) {
      return Extension.create({
        name,
        addGlobalAttributes() {
          return [{ types: ['textStyle'], attributes: { [attribute]: inlineStyleAttribute(attribute) } }];
        },
        addCommands() {
          const commands = { [setter]: value => ({ chain }) => chain().setMark('textStyle', { [attribute]: value }).run() };
          if (unsetter) commands[unsetter] = () => ({ chain }) => chain().setMark('textStyle', { [attribute]: null }).run();
          return commands;
        },
      });
    }
    const createFontSizeExtension = Extension => createTextStyleExtension(Extension, { name: 'fontSize', attribute: 'fontSize', setter: 'setFontSize' });
    // Couleur de police et surlignage : même schéma que la taille.
    const createTextColorExtension = Extension => createTextStyleExtension(Extension, { name: 'textColor', attribute: 'color', setter: 'setTextColor', unsetter: 'unsetTextColor' });
    const createHighlightExtension = Extension => createTextStyleExtension(Extension, { name: 'highlightColor', attribute: 'backgroundColor', setter: 'setHighlight', unsetter: 'unsetHighlight' });

    // Un réglage de liste (style de puce, de numérotation, de case) : posé sur le type de liste `type` et sérialisé en `dataAttribute` quand il
    // s'écarte de `fallback`. Le rendu réel est en CSS.
    function createListStyleExtension(Extension, { name, type, attribute, dataAttribute, fallback }) {
      return Extension.create({
        name,
        addGlobalAttributes() {
          return [{
            types: [type],
            attributes: {
              [attribute]: {
                default: fallback,
                parseHTML: el => el.getAttribute(dataAttribute) || fallback,
                renderHTML: attrs => (attrs[attribute] && attrs[attribute] !== fallback ? { [dataAttribute]: attrs[attribute] } : {}),
              },
            },
          }];
        },
      });
    }
    const createBulletStyleExtension = Extension => createListStyleExtension(Extension, { name: 'bulletStyle', type: 'bulletList', attribute: 'bulletStyle', dataAttribute: 'data-bullet-style', fallback: 'disc' });
    const createOrderedListStyleExtension = Extension => createListStyleExtension(Extension, { name: 'orderedListStyle', type: 'orderedList', attribute: 'numberStyle', dataAttribute: 'data-number-style', fallback: 'decimal' });
    const createTaskListStyleExtension = Extension => createListStyleExtension(Extension, { name: 'taskListStyle', type: 'taskList', attribute: 'taskListStyle', dataAttribute: 'data-tasklist-style', fallback: 'accentStrike' });
    return {
      inlineStyleAttribute, createFontSizeExtension, createTextColorExtension, createHighlightExtension, createBulletStyleExtension,
      createOrderedListStyleExtension, createTaskListStyleExtension,
    };
  })();

  const { withCellBackground, parseColwidthOnce, withFastColwidth, createTableView, findTwoColumnsContext } = (function () {
    // Les cellules et les tableaux : fond, largeur de colonne, vue, zone à deux colonnes autour

    // Fond de cellule - augmente TableCell/TableHeader du même backgroundColor que le surlignage de texte (lu par pdf-export.js:tableFrom, pas
    // inheritedStyle).
    function withCellBackground(CellExtension) {
      return CellExtension.extend({
        addAttributes() {
          return Object.assign({}, this.parent(), { backgroundColor: inlineStyleAttribute('backgroundColor') });
        },
      });
    }
    // Largeur d'une case lue sans son attribut `colwidth` : celle de sa colonne dans le <colgroup> du tableau. La bibliothèque cherche les <col> du
    // tableau entier POUR CHAQUE case, un parcours du tableau par case (1,3 s pour 1 000 lignes de 6 colonnes, quadratique) ; ils ne sont cherchés ici
    // qu'une fois par tableau, le temps de la lecture du HTML (la mémoire est vidée dès la fin de la tâche : un tableau déjà dans la page peut avoir
    // changé de colonnes).
    let colgroupColsByTable = new WeakMap();
    function parseColwidthOnce(element) {
      const attribute = element.getAttribute('colwidth');
      if (attribute) return attribute.split(',').map(width => parseInt(width, 10));
      const row = element.parentElement;
      const table = element.closest('table');
      if (!row || !table) return null;
      let cols = colgroupColsByTable.get(table);
      if (!cols) {
        cols = table.querySelectorAll('colgroup > col');
        colgroupColsByTable.set(table, cols);
        Promise.resolve().then(() => { colgroupColsByTable = new WeakMap(); });
      }
      const col = cols[Array.prototype.indexOf.call(row.children, element)];
      const width = col ? col.getAttribute('width') : null;
      return width ? [parseInt(width, 10)] : null;
    }
    function withFastColwidth(CellExtension) {
      return CellExtension.extend({
        addAttributes() {
          const parent = this.parent();
          return Object.assign({}, parent, { colwidth: Object.assign({}, parent.colwidth, { parseHTML: parseColwidthOnce }) });
        },
      });
    }
    // Le tableau de Tiptap (TableView, @tiptap/extension-table) pose `min-width` sur le <col> d'une colonne sans largeur mais ne retire pas le `width` d'avant :
    // une largeur redevenue « automatique » (Refuser un glissé de bord, Annuler, sur un tableau inséré à la main) gardait à l'écran celle qu'elle venait de
    // perdre, alors que le document avait retrouvé sa mise en page d'origine.
    function createTableView(TableView) {
      return class extends TableView {
        update(node) {
          const same = super.update(node);
          if (!same || !node.firstChild) return same;
          let index = 0;
          node.firstChild.forEach(cell => {
            for (let j = 0; j < cell.attrs.colspan; j += 1, index += 1) {
              if (!(cell.attrs.colwidth && cell.attrs.colwidth[j]) && this.colgroup.children[index]) this.colgroup.children[index].style.removeProperty('width');
            }
          });
          return same;
        }
      };
    }
    // La colonne d'une zone 2 colonnes où se trouve le curseur : { columnDepth, zoneDepth, colIndex }, ou null hors d'une zone.
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
    return { withCellBackground, parseColwidthOnce, withFastColwidth, createTableView, findTwoColumnsContext };
  })();

  const { createTabNavigationExtension, createClearHistoryExtension } = (function () {
    // Les touches d'un tableau et l'effacement de l'historique

    // Tab / Shift-Tab : dans une liste, indente ou désindente l'élément (la touche est toujours consommée, jamais de passage à la cellule ou à la
    // colonne suivante) ; dans une zone 2 colonnes, passe d'une colonne à l'autre ou sort de la zone.
    function createTabNavigationExtension(Extension) {
      // Le curseur au plus près de `pos`, dans le sens `dir`.
      const moveNear = (ed, pos, dir) => ed.chain().focus().setTextSelection(EditorCore.getTextSelectionClass().near(ed.state.doc.resolve(pos), dir)).run();
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
              const size = ed.state.doc.content.size;
              if (ctx.colIndex === 0) {
                moveNear(ed, Math.min($from.after(ctx.columnDepth) + 1, size), 1);
                return true;
              }
              const afterZone = $from.after(ctx.zoneDepth);
              if (afterZone >= size) ed.chain().focus().insertContentAt(afterZone, { type: 'paragraph' }).setTextSelection(afterZone + 1).run();
              else moveNear(ed, afterZone, 1);
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
              if (ctx.colIndex === 1) {
                moveNear(ed, Math.max($from.before(ctx.columnDepth) - 1, 0), -1);
                return true;
              }
              const beforeZone = $from.before(ctx.zoneDepth);
              if (beforeZone > 0) moveNear(ed, beforeZone - 1, -1); // rien avant la zone : sans effet
              return true;
            },
          };
        },
      });
    }

    // TipTap v3 n'expose plus de commande clearHistory (seulement undo/redo) : reconstruire l'EditorState avec les mêmes plugins réinitialise leur état
    // (dont l'historique) sans recréer la vue ni perdre le document.
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
    return { createTabNavigationExtension, createClearHistoryExtension };
  })();

  const { leftTrack, twoColumnsZoneAttributes, twoColumnsViewDom } = (function () {
    // Zone 2 colonnes : largeur de la colonne de gauche, attributs, DOM de la vue

    // La largeur de la colonne de gauche d'une zone 2 colonnes : une longueur en mm, ou un pourcentage de la boîte de contenu.
    const leftTrack = attrs => (Number.isFinite(attrs.layoutLeftMm) ? attrs.layoutLeftMm + 'mm' : (attrs.layoutLeft || 50) + '%');

    function twoColumnsZoneAttributes() {
      return {
        // Largeur (%) de la colonne gauche, bornée à 20-80 au glisser, sérialisée en variable CSS --layout-left. Seule source de vérité tant que
        // layoutLeftMm est absent (mode pourcentage). En mode mm, --layout-left porte une longueur (« 60mm ») et plus un pourcentage : on ne la
        // relit pas ici (layoutLeftMm fait foi), sans quoi « 60mm » serait relu comme « 60 % ».
        layoutLeft: {
          default: 50,
          parseHTML: el => {
            const raw = el.style.getPropertyValue('--layout-left');
            const v = parseFloat(raw);
            return (/%\s*$/.test(raw) && Number.isFinite(v)) ? v : 50;
          },
          renderHTML: () => ({}),
        },
        // Largeur absolue (mm) de la colonne gauche ; `null` = mode pourcentage (défaut). Non null = mode mm : --layout-left est posée en
        // millimètres. La différence n'est pas cosmétique : un pourcentage s'applique à la boîte de contenu de la zone (amputée de son padding et
        // de sa bordure), donc « 60mm » converti en % ne donnait 60 mm nulle part (57,7 mm à l'écran et dans le PDF, 60 mm dans le DOCX). Une
        // longueur absolue vaut 60 mm partout, et le moteur CSS la réévalue seul quand les marges de page changent, sans redessin JS.
        layoutLeftMm: {
          default: null,
          parseHTML: el => { const v = parseFloat(el.style.getPropertyValue('--layout-left-mm')); return Number.isFinite(v) ? v : null; },
          renderHTML: () => ({}),
        },
      };
    }

    function twoColumnsViewDom() {
      // dom = wrapper externe (ancre la poignée en absolu) englobant contentDOM (les 2 colonnes) et la poignée, hors contentDOM pour éviter qu'une
      // future réconciliation la retire. --layout-left posé sur le wrapper (hérite vers le bas ; la poignée ne le verrait pas posé sur contentDOM).
      const wrap = document.createElement('div');
      wrap.className = 'two-columns-zone-outer';
      const contentDOM = document.createElement('div');
      contentDOM.className = 'two-columns-zone';
      wrap.appendChild(contentDOM);
      const grip = document.createElement('div');
      grip.className = 'two-columns-resize-grip';
      grip.title = I18n.t('twoColumns.resizeGrip');
      wrap.appendChild(grip);
      // Bouton dédié, indépendant de la poignée de glisser (pas de clic sans mouvement ambigu à détecter) : il ouvre un popover avec les deux
      // largeurs (gauche saisissable, droite affichée en direct) plutôt qu'un seul champ ambigu.
      const mmButton = document.createElement('button');
      mmButton.type = 'button';
      mmButton.className = 'two-columns-mm-button';
      mmButton.title = I18n.t('twoColumns.widthMmButton');
      mmButton.textContent = 'mm';
      wrap.appendChild(mmButton);
      return { wrap, contentDOM, grip, mmButton };
    }
    return { leftTrack, twoColumnsZoneAttributes, twoColumnsViewDom };
  })();

  const { twoColumnsGripDrag, commitZoneMm, twoColumnsPopoverDom } = (function () {
    // Zone 2 colonnes : poignée de glisser, saisie de la largeur en mm

    function twoColumnsGripDrag(wrap, grip, nodeEditor, getPos) {
      // Le glisser de la poignée : le pourcentage suit la souris sur le wrapper, puis s'écrit dans le nœud au relâchement.
      let dragging = false;
      // Vrai dès que la souris a bougé depuis l'appui : alors seulement --layout-left du wrapper porte un pourcentage lu sur la souris.
      let moved = false;
      function onMove(event) {
        const rect = wrap.getBoundingClientRect();
        if (!rect.width) return;
        const left = ((event.clientX - rect.left) / rect.width) * 100;
        wrap.style.setProperty('--layout-left', Math.max(20, Math.min(80, left)) + '%');
        moved = true;
      }
      function onUp() {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        const finalLeftPercent = Math.max(20, Math.min(80, parseFloat(wrap.style.getPropertyValue('--layout-left')) || 50));
        const live = liveNode(nodeEditor, getPos);
        if (!live) return;
        // Un clic sans mouvement laisse une zone en mm telle quelle : --layout-left y porte une longueur (« 60mm ») que parseFloat lirait comme
        // « 60 % » (60 mm deviendraient 114 mm).
        if (!moved && Number.isFinite(live.node.attrs.layoutLeftMm)) return;
        const newAttrs = Object.assign({}, live.node.attrs, { layoutLeft: Math.round(finalLeftPercent) });
        // Reste en mode mm après un glisser (ne repasse pas silencieusement en mode pourcentage) : reconvertit la position finale en mm.
        if (Number.isFinite(live.node.attrs.layoutLeftMm)) {
          newAttrs.layoutLeftMm = Math.round(finalLeftPercent / 100 * PageLayout.getContentWidthMm());
        }
        nodeEditor.view.dispatch(nodeEditor.state.tr.setNodeMarkup(live.pos, undefined, newAttrs));
      }
      grip.addEventListener('mousedown', event => {
        event.preventDefault(); event.stopPropagation();
        dragging = true;
        moved = false;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp, { once: true });
      });
      return { isDragging: () => dragging, release: () => document.removeEventListener('mousemove', onMove) };
    }

    function commitZoneMm(nodeEditor, getPos, value) {
      // Écrit la largeur saisie (mm) dans le nœud, bornée entre 10 mm et ce qui laisse 10 mm à la colonne de droite.
      const live = liveNode(nodeEditor, getPos);
      if (!live) return;
      const contentWidthMm = PageLayout.getContentWidthMm();
      // La gouttière (PageLayout.getColumnGapMm()) est prise sur la largeur de contenu comme n'importe quelle colonne : la borne haute doit la
      // retrancher, sinon une saisie « largeur de contenu - 10 » laisse une colonne droite négative.
      const gapMm = PageLayout.getColumnGapMm();
      const clamped = Math.max(10, Math.min(contentWidthMm - gapMm - 10, value));
      const pct = (clamped / contentWidthMm) * 100;
      nodeEditor.view.dispatch(nodeEditor.state.tr.setNodeMarkup(live.pos, undefined, Object.assign({}, live.node.attrs, { layoutLeftMm: clamped, layoutLeft: Math.round(pct) })));
    }

    function twoColumnsPopoverDom(startLeftMm) {
      // Les deux étiquettes du popover : la largeur de gauche (un champ nombre) et celle de droite (un texte).
      const popover = document.createElement('div');
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
      return { popover, leftInput, rightDisplay };
    }
    return { twoColumnsGripDrag, commitZoneMm, twoColumnsPopoverDom };
  })();

  const { wireTwoColumnsInput } = (function () {
    // Zone 2 colonnes : le champ de la largeur de gauche

    function wireTwoColumnsInput(leftInput, rightDisplay, contentWidthMm, commitMm, closePopover) {
      // La colonne droite est le reste de la largeur de contenu moins la gouttière, comme l'éditeur, le PDF et le DOCX la rendent.
      const gapMm = PageLayout.getColumnGapMm();
      const refreshRightDisplay = () => {
        const v = parseFloat(leftInput.value);
        rightDisplay.textContent = Number.isFinite(v) ? Math.round(contentWidthMm - gapMm - v) : '—';
      };
      refreshRightDisplay();
      leftInput.addEventListener('input', refreshRightDisplay);
      leftInput.focus();
      leftInput.select();

      // `settled` évite qu'Échap valide quand même : retirer le popover du DOM déclenche un blur natif sur l'input encore actif, qui
      // rappellerait commitAndClose() une seconde fois (Échap annule, il ne valide pas).
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
        // `wrap` (donc ce popover) vit dans l'arbre contentEditable de ProseMirror (c'est le `dom` de cette NodeView) : sans stopPropagation,
        // un keydown tapé ici remonte jusqu'au gestionnaire de ProseMirror sur .tiptap, qui l'intercepte comme une commande d'édition du
        // document (baseKeymap : Suppr -> joinForward/selectNodeForward) et appelle preventDefault ; Suppr n'effacerait alors jamais le
        // caractère de ce champ nombre. Les autres champs de l'application vivent hors de .tiptap (EditorCore.createFloatingPanel les pose sur
        // document.body).
        event.stopPropagation();
        if (event.key === 'Enter') { event.preventDefault(); commitAndClose(); }
        else if (event.key === 'Escape') { event.preventDefault(); cancelAndClose(); }
      });
      leftInput.addEventListener('blur', commitAndClose);
    }
    return { wireTwoColumnsInput };
  })();

  const { twoColumnsNodeView } = (function () {
    // Zone 2 colonnes : le popover du bouton « mm » et la vue

    function twoColumnsMmPopover(wrap, mmButton, node, nodeEditor, getPos) {
      // Popover du bouton « mm » : deux valeurs affichées (la gauche saisissable, la droite = le reste de la largeur de contenu, recalculée en
      // direct), plus clair qu'un seul champ dont on ne sait pas s'il décrit la colonne de gauche ou de droite.
      let popover = null;
      function closePopover() {
        if (!popover) return;
        // `remove()` sur un nœud que ProseMirror a déjà détaché en recréant la NodeView lève une exception : le blur de l'input, déclenché par ce
        // détachement, rappelle closePopover alors que le popover n'a plus de parent. `popover` est donc remis à null d'abord, pour que ce second
        // appel sorte tout de suite.
        const el = popover;
        popover = null;
        document.removeEventListener('mousedown', onDocMouseDown, true);
        if (el.parentNode) el.parentNode.removeChild(el);
      }
      function onDocMouseDown(event) {
        if (popover && !popover.contains(event.target) && event.target !== mmButton) closePopover();
      }
      function openPopover() {
        if (popover) { closePopover(); return; }
        const live = liveNode(nodeEditor, getPos);
        const currentAttrs = (live ? live.node : node).attrs;
        const contentWidthMm = PageLayout.getContentWidthMm();
        const startLeftMm = Number.isFinite(currentAttrs.layoutLeftMm)
          ? currentAttrs.layoutLeftMm
          : Math.round((currentAttrs.layoutLeft || 50) / 100 * contentWidthMm);

        const fields = twoColumnsPopoverDom(startLeftMm);
        popover = fields.popover;
        wrap.appendChild(popover);
        wireTwoColumnsInput(fields.leftInput, fields.rightDisplay, contentWidthMm, value => commitZoneMm(nodeEditor, getPos, value), closePopover);
        // Capture (pas bubble) : doit voir le mousedown avant que le blur de l'input ne ferme déjà le popover, sinon un clic sur le fond de
        // l'éditeur ouvrirait ou fermerait de façon incohérente.
        setTimeout(() => document.addEventListener('mousedown', onDocMouseDown, true), 0);
      }
      mmButton.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        openPopover();
      });
      return { close: closePopover };
    }

    function twoColumnsNodeView({ node, editor: nodeEditor, getPos }) {
      const { wrap, contentDOM, grip, mmButton } = twoColumnsViewDom();
      // En mode mm, --layout-left porte la longueur elle-même : le CSS suit seul les changements de marges de page. Un pourcentage dérivé
      // resterait figé, car Editor.refreshLayout() dispatche une transaction vide qui ne réconcilie aucune NodeView : l'écran garderait l'ancien
      // ratio pendant que getHTML() sérialise déjà le nouveau.
      const applyLayout = attrs => wrap.style.setProperty('--layout-left', leftTrack(attrs));
      applyLayout(node.attrs);
      const drag = twoColumnsGripDrag(wrap, grip, nodeEditor, getPos);
      const popover = twoColumnsMmPopover(wrap, mmButton, node, nodeEditor, getPos);
      return {
        dom: wrap,
        contentDOM,
        update: updatedNode => {
          if (updatedNode.type.name !== 'twoColumnsZone') return false;
          if (!drag.isDragging()) applyLayout(updatedNode.attrs);
          return true;
        },
        destroy: () => { drag.release(); popover.close(); },
        // Sans cela, ProseMirror voit la mutation de style du glisser (hors transaction) comme inattendue et recrée la NodeView : le wrapper est
        // alors détaché avant le mouseup et le commit final s'applique à un nœud fantôme.
        ignoreMutation: () => true,
      };
    }
    return { twoColumnsNodeView };
  })();

  const { createTwoColumnsNodes } = (function () {
    // Zone 2 colonnes : les nœuds

    // Zone 2 colonnes : une paire de colonnes imbriquées. `isolating: true` empêche Retour arrière et Suppr de fusionner la zone avec le paragraphe
    // voisin.
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
        addAttributes() { return twoColumnsZoneAttributes(); },
        parseHTML() { return [{ tag: 'div.two-columns-zone' }]; },
        renderHTML({ HTMLAttributes, node }) {
          const mm = node.attrs.layoutLeftMm;
          const style = `--layout-left: ${leftTrack(node.attrs)}` + (Number.isFinite(mm) ? `; --layout-left-mm: ${mm}mm` : '');
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
        addNodeView() { return twoColumnsNodeView; },
      });
      return { TwoColumnsColumn, TwoColumnsZone };
    }
    return { createTwoColumnsNodes };
  })();

  const { conditionalTextNodeView } = (function () {
    // Bloc de texte conditionnel : la vue de l'éditeur

    function conditionalTextNodeView(views, { node: initialNode, editor: nodeEditor, getPos }) {
      // Vue de l'éditeur seulement. L'étiquette est hors du contentDOM (jamais lue comme contenu du bloc) ; un clic dessus sélectionne le bloc entier
      // - un conteneur ne se sélectionne pas d'un clic simple - ce qui ouvre sa barre flottante
      // (js/floating-toolbars.js:wireVariableFloatingToolbar).
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
        const live = liveNode(nodeEditor, getPos);
        if (live) nodeEditor.chain().focus().setNodeSelection(live.pos).run();
      });
      // Un clic dans le texte d'un bloc resté sélectionné (la fenêtre de condition se referme sur lui) doit poser le curseur : le bloc
      // sélectionné est déplaçable à la souris, et Chrome ne pose pas le curseur dans ce qui peut être glissé (ProseMirror ne le rattrape qu'à
      // deux positions de la fin du bloc). Le clic pose donc le curseur là où il tombe ; une bulle, une image et l'étiquette gardent leur propre
      // clic.
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
        // Le bloc sélectionné (clic sur son étiquette) porte sa propre classe, comme l'image (editor-image-selected) ; ProseMirror, pour un
        // conteneur sélectionné, le rend aussi déplaçable à la souris - on garde ce comportement.
        selectNode: () => { dom.classList.add('conditional-text-selected'); dom.draggable = true; },
        deselectNode: () => { dom.classList.remove('conditional-text-selected'); dom.removeAttribute('draggable'); },
        // L'étiquette et les attributs du cadre sont posés hors transaction : ProseMirror ne doit pas les lire comme une modification du
        // document.
        ignoreMutation: mutation => mutation.type !== 'selection' && (tag.contains(mutation.target) || mutation.target === dom),
        stopEvent: event => tag.contains(event.target),
        destroy: () => views.delete(refresh),
      };
    }
    return { conditionalTextNodeView };
  })();

  const { createConditionalTextNode } = (function () {
    // Bloc de texte conditionnel : le nœud

    // Bloc de texte conditionnel (menu des variables, onglet Chips) : un conteneur de blocs - paragraphes mis en forme, titres, listes, tableaux et
    // d'autres blocs conditionnels, à toute profondeur - qui n'apparaît en lecture et à l'export que si sa condition d'affichage est remplie
    // (js/conditional-text.js). Même condition que celle d'une bulle ({ mode, rules }, fenêtre js/variable-condition.js, barre flottante
    // js/floating-toolbars.js) ; sans condition, le bloc est toujours affiché. Le cadre et l'étiquette « Si … » n'existent que dans l'éditeur
    // (NodeView) : renderHTML, donc l'enregistrement, le presse-papiers et les exports, ne sérialise que <div class="conditional-text" data-condition>,
    // que le rendu défait (condition remplie) ou retire (sinon).
    function createConditionalTextNode(Node, mergeAttributes) {
      const views = languageViews();
      return Node.create({
        name: 'conditionalText',
        group: 'block',
        content: 'block+',
        // Le premier paragraphe d'un bloc qu'on vide ou qu'on colle ailleurs garde son bloc autour de lui, comme une citation.
        defining: true,
        addAttributes() {
          return { condition: internalAttr(null) };
        },
        parseHTML() {
          return [{ tag: 'div.conditional-text', getAttrs: el => ({ condition: jsonAttr(el, 'data-condition') }) }];
        },
        renderHTML({ HTMLAttributes, node }) {
          const attrs = mergeAttributes(HTMLAttributes, { class: 'conditional-text' });
          if (node.attrs.condition) attrs['data-condition'] = JSON.stringify(node.attrs.condition);
          return ['div', attrs, 0];
        },
        addNodeView() { return props => conditionalTextNodeView(views, props); },
      });
    }
    return { createConditionalTextNode };
  })();

  const { createConditionalCheckboxNode } = (function () {
    // Case conditionnelle

    // Case conditionnelle (menu des variables, onglet Chips) : une puce en ligne qui se lit comme une case cochée quand sa condition est remplie,
    // décochée sinon (js/conditional-checkbox.js). Même condition que celle d'une bulle ou d'un bloc de texte ({ mode, rules }, fenêtre
    // js/variable-condition.js, barre flottante js/floating-toolbars.js) ; `style` : l'un des trois styles de case de la liste à cases
    // (VariableFormat.BOOL_CHECKBOX_STYLES). Dans l'éditeur la puce montre sa case décochée, dessinée comme à la Lecture (classe `.resolved-checkbox`),
    // et « Si Statut = Urgent » (ou « sans condition ») ; renderHTML, donc l'enregistrement, le presse-papiers et les exports, ne sérialise que <span
    // class="conditional-checkbox" data-condition data-checkbox-style>, que le rendu remplace par la case cochée ou non.
    function createConditionalCheckboxNode(Node, mergeAttributes) {
      const views = languageViews();
      function attrsOf(HTMLAttributes, node) {
        const attrs = mergeAttributes(HTMLAttributes, { class: 'conditional-checkbox', contenteditable: 'false', 'data-checkbox-style': ConditionalCheckbox.styleOf(node.attrs.style) });
        if (node.attrs.condition) attrs['data-condition'] = JSON.stringify(node.attrs.condition);
        return attrs;
      }
      return inlineAtom(Node, {
        name: 'conditionalCheckbox',
        addAttributes() {
          return { condition: internalAttr(null), style: internalAttr(ConditionalCheckbox.DEFAULT_STYLE) };
        },
        parseHTML() {
          return [{
            tag: 'span.conditional-checkbox',
            getAttrs: el => ({ condition: jsonAttr(el, 'data-condition'), style: ConditionalCheckbox.styleOf(el.getAttribute('data-checkbox-style')) }),
          }];
        },
        renderHTML({ HTMLAttributes, node }) {
          return ['span', attrsOf(HTMLAttributes, node), VariableFormat.UNCHECKED_BOX];
        },
        // Vue de l'éditeur seulement : la case dessinée, puis le libellé de la condition (coupé par « … » quand la case ou la colonne qui le porte est
        // trop étroite, css/conditional-checkbox.css) ; le texte entier est dans son info-bulle et dans son nom accessible. Pas de `update` :
        // ProseMirror garde la vue tant que le nœud est identique et la refait sinon.
        addNodeView() {
          return ({ node, HTMLAttributes }) => {
            const dom = document.createElement('span');
            setAttrs(dom, attrsOf(HTMLAttributes, node));
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
            // Le libellé en deux morceaux, comme une bulle (splitBadgeLabel) : trop long pour sa case ou sa colonne, c'est son milieu que « … »
            // remplace, jamais le bout (css/conditional-checkbox.css).
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
    return { createConditionalCheckboxNode };
  })();

  const { createConditionalValueNode } = (function () {
    // Valeur conditionnelle

    // Valeur conditionnelle (menu des variables, onglet Chips) : une valeur - un ou plusieurs mots, un nombre... - qui s'affiche de manière
    // conditionnelle, posée dans la phrase, petite, son contour grandissant avec le texte et les retours à la ligne : le pendant en ligne du bloc de
    // texte conditionnel. Un nœud en ligne qui contient du texte (marques, bulles, retours à la ligne) et que sa condition fait apparaître en lecture
    // et à l'export (js/conditional-value.js) ou disparaître. Même condition que celle d'une bulle ou d'un bloc ({ mode, rules }, fenêtre
    // js/variable-condition.js, barre flottante js/floating-toolbars.js) ; sans condition, la valeur est toujours affichée. Dans l'éditeur le texte est
    // celui de la phrase, simplement entouré d'un cadre (css/conditional-value.css) : aucune étiquette ne prend de place dans la ligne, le texte passe
    // donc à la ligne exactement où il le fera à l'export. renderHTML, donc l'enregistrement, le presse-papiers et les exports, ne sérialise que <span
    // class="conditional-value" data-condition>.
    function createConditionalValueNode(Node, mergeAttributes) {
      const views = languageViews();
      return Node.create({
        name: 'conditionalValue',
        group: 'inline',
        inline: true,
        content: 'inline*',
        addAttributes() {
          return { condition: internalAttr(null) };
        },
        parseHTML() {
          return [{
            tag: 'span.conditional-value',
            // ProseMirror traite le contenu d'un nœud comme celui d'un bloc : il en retire l'espace du début et celle de la fin (« Dossier<valeur>
            // urgent</valeur> » relu, « urgent » collait au mot d'avant). Une valeur garde les siennes - c'est ce qui permet de masquer l'espace avec
            // le mot -, les retours à la ligne du source HTML devenant des espaces.
            preserveWhitespace: true,
            getAttrs: el => ({ condition: jsonAttr(el, 'data-condition') }),
          }];
        },
        renderHTML({ HTMLAttributes, node }) {
          const attrs = mergeAttributes(HTMLAttributes, { class: 'conditional-value' });
          if (node.attrs.condition) attrs['data-condition'] = JSON.stringify(node.attrs.condition);
          return ['span', attrs, 0];
        },
        // Vue de l'éditeur seulement : la même balise, son texte d'attente quand elle est vide, son info-bulle (la condition en toutes lettres) et sa
        // classe `has-condition`.
        addNodeView() {
          return ({ node: initialNode }) => {
            let node = initialNode;
            const dom = document.createElement('span');
            dom.className = 'conditional-value';
            dom.setAttribute('role', 'group');
            function refresh() {
              const condition = ConditionRules.normalizeCondition(node.attrs.condition);
              if (node.attrs.condition) dom.setAttribute('data-condition', JSON.stringify(node.attrs.condition)); else dom.removeAttribute('data-condition');
              dom.classList.toggle('has-condition', !!condition);
              dom.setAttribute('data-placeholder', I18n.t('condValue.placeholder'));
              const title = condition ? I18n.t('condValue.titleIf', { condition: VariableCondition.describe(condition, { full: true }) }) : I18n.t('condValue.titleNone');
              dom.title = title;
              dom.setAttribute('aria-label', title);
            }
            refresh();
            views.add(refresh);
            return {
              dom,
              contentDOM: dom,
              update: updatedNode => {
                if (updatedNode.type !== node.type) return false;
                node = updatedNode;
                refresh();
                return true;
              },
              // Les attributs de la balise sont posés hors transaction : ProseMirror ne doit pas les lire comme une modification du document.
              ignoreMutation: mutation => mutation.type === 'attributes' && mutation.target === dom,
              destroy: () => views.delete(refresh),
            };
          };
        },
      });
    }
    return { createConditionalValueNode };
  })();

  const { valueAt, atEdge, leave, typeAtEdge } = (function () {
    // Touches d'une valeur conditionnelle : bords, flèches, frappe

    const valueAt = state => {
      const { $from, empty } = state.selection;
      return $from.parent.type.name === 'conditionalValue' ? { $from, empty } : null;
    };
    const moveTo = (editor, pos) => {
      const TextSelection = EditorCore.getTextSelectionClass();
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
    };
    const atEdge = (editor, dir) => {
      // Retour arrière (`dir` -1) ou Suppr (1) avec le curseur au bord ou dans une valeur vide. Rend vrai quand la touche est consommée.
      const here = valueAt(editor.state);
      if (!here || !here.empty || !editor.isEditable) return false;
      const { $from } = here;
      const size = $from.parent.content.size;
      if (!size) {
        const before = $from.before();
        const tr = editor.state.tr.delete(before, $from.after());
        tr.setSelection(EditorCore.getTextSelectionClass().near(tr.doc.resolve(before), dir));
        editor.view.dispatch(tr.scrollIntoView());
        return true;
      }
      if (dir < 0 && $from.parentOffset === 0) moveTo(editor, $from.before());
      else if (dir > 0 && $from.parentOffset === size) moveTo(editor, $from.after());
      return false;
    };
    const leave = (editor, dir) => {
      // Flèche droite (`dir` 1) à la fin d'une valeur, flèche gauche (-1) à son début : le curseur passe de l'autre côté du bord. Rend vrai quand la
      // touche est consommée ; ailleurs dans la valeur, avec une sélection ou avec Maj, la flèche suit son cours.
      const here = valueAt(editor.state);
      if (!here || !here.empty || !editor.isEditable) return false;
      const { $from } = here;
      if ($from.parentOffset !== (dir > 0 ? $from.parent.content.size : 0)) return false;
      moveTo(editor, dir > 0 ? $from.after() : $from.before());
      return true;
    };
    const typeAtEdge = (view, event) => {
      // Frappe (`beforeinput`, insertText) quand le curseur de ProseMirror est au bord d'une valeur - juste dehors, ou dedans au début ou à la fin de
      // son contenu : le texte entre à cet endroit, par la même voie que la frappe de ProseMirror (`handleTextInput`, donc les règles de saisie), et
      // non là où le navigateur le mettrait. Au milieu du texte, il tape comme d'habitude.
      const { selection, schema } = view.state;
      if (event.isComposing || !event.data || !selection.empty) return false;
      const type = schema.nodes.conditionalValue;
      const { $from } = selection;
      const outside = ($from.nodeBefore && $from.nodeBefore.type === type) || ($from.nodeAfter && $from.nodeAfter.type === type);
      const edgeInside = $from.parent.type === type && ($from.parentOffset === 0 || $from.parentOffset === $from.parent.content.size);
      if (!outside && !edgeInside) return false;
      event.preventDefault();
      const tr = view.state.tr.insertText(event.data);
      if (!view.someProp('handleTextInput', f => f(view, selection.from, selection.to, event.data, () => tr))) view.dispatch(tr.scrollIntoView());
      return true;
    };
    return { valueAt, atEdge, leave, typeAtEdge };
  })();
  const { dropEmptiedValues, deleteWholeContent } = (function () {
    // Touches d'une valeur conditionnelle : suivi des modifications et suppression du contenu entier

    function dropEmptiedValues(transactions, oldState, newState) {
      // Suivi des modifications : la bibliothèque (js/track-changes.js) ne marque que le texte d'une valeur - un nœud qui n'est pas une feuille ne
      // porte pas ses marques -, jamais la valeur elle-même. « Tout accepter » d'une valeur supprimée ou défaite, « Tout refuser » d'une valeur insérée
      // (ou d'un texte tapé dedans) ne lui laissent donc qu'un cadre vide, avec sa condition : il part avec son contenu. Seule la résolution des
      // suggestions est concernée (sa transaction porte le méta `skip` de la bibliothèque), et seule une valeur dont tout le contenu était suggéré
      // (inséré ou supprimé) et qui s'est vidée par elle : un texte effacé à la main dans une valeur la laisse vide, comme hors suivi.
      if (!transactions.some(tr => tr.docChanged && TrackChanges.isSkipped(tr))) return null;
      const type = newState.schema.nodes.conditionalValue;
      const emptied = [];
      newState.doc.descendants((node, pos) => { if (node.type === type && node.content.size === 0) emptied.push({ pos, size: node.nodeSize }); });
      if (!emptied.length) return null;
      // La position d'une valeur dans le document d'avant : les transactions reprises à l'envers, chacune par sa table inversée.
      const positionBefore = pos => transactions.slice().reverse().reduce((at, tr) => tr.mapping.invert().map(at, 1), pos);
      const suggested = child => child.marks.some(mark => mark.type.name === 'insertion' || mark.type.name === 'deletion');
      const gone = emptied.filter(({ pos }) => {
        const before = oldState.doc.nodeAt(positionBefore(pos));
        return !!before && before.type === type && before.childCount > 0 && Array.from({ length: before.childCount }, (_, i) => before.child(i)).every(suggested);
      });
      if (!gone.length) return null;
      const tr = newState.tr;
      gone.reverse().forEach(({ pos, size }) => tr.delete(pos, pos + size));
      return tr;
    }
    function deleteWholeContent(view, event) {
      // Une suppression qui viderait la valeur (le dernier caractère, un mot entier) se fait ici : le navigateur retirerait la balise vide, avec sa
      // condition (`beforeinput`, cible lue par `getTargetRanges`). Effacer le texte d'une valeur la laisse vide, avec son texte d'attente.
      if (!view.editable || !/^delete/.test(event.inputType || '') || typeof event.getTargetRanges !== 'function') return false;
      const ranges = event.getTargetRanges();
      if (ranges.length !== 1) return false;
      let from;
      let to;
      try {
        from = view.posAtDOM(ranges[0].startContainer, ranges[0].startOffset);
        to = view.posAtDOM(ranges[0].endContainer, ranges[0].endOffset);
      } catch (e) { return false; }
      if (!(from < to) || to > view.state.doc.content.size) return false;
      const $from = view.state.doc.resolve(from);
      if ($from.parent.type.name !== 'conditionalValue' || from !== $from.start() || to !== $from.end()) return false;
      event.preventDefault();
      view.dispatch(view.state.tr.delete(from, to).scrollIntoView());
      return true;
    }
    return { dropEmptiedValues, deleteWholeContent };
  })();

  const { createConditionalValueKeysExtension } = (function () {
    // Touches d'une valeur conditionnelle : l'extension

    function createConditionalValueKeysExtension(Extension, Plugin, PluginKey) {
      // Touches d'une valeur conditionnelle, dans une extension à part (pour ne pas changer l'ordre des nœuds du schéma), rangée comme celle de l'Entrée
      // d'une grille (js/editor.js) : après StarterKit, donc essayée avant ses touches, et avant Variables et TextExpansion, donc après elles - leurs
      // listes ouvertes gardent Entrée.
      // - Entrée est un retour à la ligne dans la valeur (le cadre grandit d'une ligne) : sans elle, la valeur n'étant pas un bloc, TipTap couperait le
      //   paragraphe autour d'elle.
      // - Retour arrière au début de la valeur, Suppr à sa fin : les commandes de base de TipTap (joinBackward, joinForward), appelées sans la vue,
      //   prennent le bord de la valeur pour celui d'un paragraphe et mangent le texte voisin. Le curseur passe donc d'abord de l'autre côté du bord, et
      //   la touche suit son cours : elle efface le caractère voisin, comme si la valeur n'était pas là. Dans une valeur vide, elles la retirent : sinon
      //   rien ne l'ôterait une fois son texte effacé.
      // - Une suppression qui viderait la valeur : voir deleteWholeContent.
      // - Flèche droite à la fin d'une valeur, flèche gauche à son début : le curseur sort de la valeur sans bouger à l'écran, la frappe suivante se pose
      //   juste derrière (ou devant) son cadre. Sans elles, une valeur en fin de paragraphe ne se quittait pas au clavier (la flèche passait au
      //   paragraphe suivant) et ce qu'on tapait pour finir la phrase entrait dans la valeur.
      // - Une frappe au bord d'une valeur (juste dehors, ou dedans au début ou à la fin de son contenu, valeur vide comprise) se pose là où ProseMirror a
      //   le curseur. Un bord de cadre n'a qu'une place à l'écran et Chrome choisit seul de quel côté la frappe tombe (l'élément qui précède, le plus
      //   souvent) : la valeur avalait la suite de la phrase tapée derrière elle.
      return Extension.create({
        name: 'conditionalValueKeys',
        addKeyboardShortcuts() {
          return {
            Enter: ({ editor }) => (valueAt(editor.state) && editor.isEditable) ? editor.commands.setHardBreak() : false,
            Backspace: ({ editor }) => atEdge(editor, -1),
            Delete: ({ editor }) => atEdge(editor, 1),
            ArrowRight: ({ editor }) => leave(editor, 1),
            ArrowLeft: ({ editor }) => leave(editor, -1),
          };
        },
        addProseMirrorPlugins() {
          return [new Plugin({
            key: new PluginKey('conditionalValueInput'),
            appendTransaction: dropEmptiedValues,
            props: {
              handleDOMEvents: {
                beforeinput: (view, event) => (view.editable && event.inputType === 'insertText' ? typeAtEdge(view, event) : deleteWholeContent(view, event)),
              },
            },
          })];
        },
      });
    }
    return { createConditionalValueKeysExtension };
  })();

  const { isFloatingImage, caretBeside, keys } = (function () {
    // Images en calque : Retour arrière et Suppr sur le texte voisin

    // Une image en calque (devant ou derrière le texte) se place par sa grille de page, pas par sa ligne : le paragraphe qui la porte n'est qu'une
    // ancre, un caractère sans largeur qui ne se voit pas à l'écran.
    function isFloatingImage(node) { return !!node && node.type.name === 'editorImage' && !!node.attrs.layer && node.attrs.layer !== 'normal'; }

    const free = editor => editor.isEditable && !Editor.isTrackChangesOn() && editor.state.selection instanceof EditorCore.getTextSelectionClass();
    const stepOver = (editor, dir) => {
      // Curseur seul : passe par-dessus les ancres collées à lui dans le sens de la touche (`dir` -1 Retour arrière, 1 Suppr). Ne consomme jamais la touche.
      if (!free(editor) || !editor.state.selection.empty) return false;
      const { doc, selection } = editor.state;
      let pos = selection.from;
      for (;;) {
        const $pos = doc.resolve(pos);
        const next = dir < 0 ? $pos.nodeBefore : $pos.nodeAfter;
        if (!isFloatingImage(next)) break;
        pos += dir * next.nodeSize;
      }
      if (pos !== selection.from) editor.view.dispatch(editor.state.tr.setSelection(EditorCore.getTextSelectionClass().create(doc, pos)));
      return false;
    };
    const caretBeside = (doc, pos) => {
      // Où poser le curseur à côté d'ancres reposées en `pos`. Derrière du texte il reste devant elles : la lettre suivante se joint au texte. Sans texte
      // devant lui (début de ligne, ligne qui ne porte que des ancres), un curseur placé devant une ancre ne reçoit pas la frappe - le navigateur
      // l'envoie au bout de la ligne du dessus - : il passe derrière elles, au même endroit à l'écran.
      if (doc.resolve(pos).nodeBefore && doc.resolve(pos).nodeBefore.isText) return pos;
      let at = pos;
      for (let next = doc.resolve(at).nodeAfter; isFloatingImage(next); next = doc.resolve(at).nodeAfter) at += next.nodeSize;
      return at;
    };
    const deleteKeepingImages = editor => {
      // Texte sélectionné : rend vrai quand la suppression est faite ici (une ancre dans la sélection), faux quand la touche suit son cours.
      if (!free(editor) || editor.state.selection.empty) return false;
      const TextSelection = EditorCore.getTextSelectionClass();
      const { doc, selection } = editor.state;
      if (selection.from <= TextSelection.atStart(doc).from && selection.to >= TextSelection.atEnd(doc).to) return false;
      const images = [];
      doc.nodesBetween(selection.from, selection.to, node => { if (isFloatingImage(node)) images.push(node); });
      if (!images.length) return false;
      const tr = editor.state.tr.deleteSelection();
      const at = tr.selection.from;
      if (!tr.doc.resolve(at).parent.inlineContent) return false;
      let end = at;
      images.forEach(image => { tr.insert(end, image); end += image.nodeSize; });
      editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, caretBeside(tr.doc, at))).scrollIntoView());
      return true;
    };
    const selectInlineImage = (editor, dir) => {
      // Curseur seul juste derrière une image au fil du texte (Retour arrière) ou juste devant (Suppr) : la touche la sélectionne au lieu de l'effacer, la
      // touche suivante (une image sélectionnée part comme d'habitude) l'efface et Annuler la rend. Rend vrai quand l'image est sélectionnée. Suivi des
      // modifications actif, la bibliothèque marque la suppression (visible, refusable) puis laisse le curseur passer par-dessus : une image sélectionnée
      // à chaque touche l'en empêcherait, la touche suit son cours.
      if (!free(editor) || !editor.state.selection.empty) return false;
      const { selection } = editor.state;
      const image = dir < 0 ? selection.$from.nodeBefore : selection.$from.nodeAfter;
      if (!image || image.type.name !== 'editorImage' || isFloatingImage(image)) return false;
      return editor.commands.setNodeSelection(dir < 0 ? selection.from - image.nodeSize : selection.from);
    };
    const keys = (names, dir) => names.reduce((all, name) => Object.assign(all, { [name]: ({ editor }) => deleteKeepingImages(editor) || stepOver(editor, dir) || selectInlineImage(editor, dir) }), {});
    return { isFloatingImage, caretBeside, keys };
  })();
  const { keepImagesOfReplacedText } = (function () {
    // Images en calque : du texte remplacé

    const sameImage = (a, b) => ['src', 'varTable', 'varColumn', 'varKey', 'qrText'].every(name => a.attrs[name] === b.attrs[name]);
    const imagesOf = doc => { const found = []; doc.descendants((node, pos) => { if (node.type.name === 'editorImage') found.push({ node, pos }); }); return found; };
    const wholeDocReplaced = trs => trs.some(tr => tr.steps.some((step, i) => typeof step.from === 'number' && typeof step.to === 'number' && step.from <= 0 && step.to >= tr.docs[i].content.size));
    function replacedTextRange(root, selection, doc) {
      // La plage de texte que la transaction a remplacée, dans le document d'avant ; null quand ce n'est pas du texte (une étape qui entoure, un nœud posé).
      if (!selection.empty) return { from: selection.from, to: selection.to };
      const step = root.steps[0];
      if (!step || !step.slice || step.gapFrom !== undefined || !(step.from < step.to)) return null;
      const $from = doc.resolve(step.from);
      if (!$from.parent.inlineContent || !$from.sameParent(doc.resolve(step.to))) return null;
      let holdsImage = false;
      step.slice.content.descendants(child => { if (child.type.name === 'editorImage') holdsImage = true; });
      return holdsImage ? null : { from: step.from, to: step.to };
    }
    function keepImagesOfReplacedText(keepKey, trs, oldState, newState) {
      // Du texte remplacé ou effacé par autre chose que Retour arrière ou Suppr sur une sélection : une lettre, Entrée, un collage, une composition, ou
      // un mot effacé en entier (Ctrl + Suppr). ProseMirror ou le navigateur le fait lui-même, aucune touche d'ici n'est jouée : les images en calque
      // du texte remplacé que la transaction a emportées sont reposées là où le remplacement se referme, dans la même étape d'annulation. Le texte
      // remplacé est la sélection, ou, curseur seul, la plage d'une seule étape de texte pur (sans image dans ce qu'elle pose) dans un seul bloc.
      // Sont rendues les images dont la sorte (source, colonne PJ, QR code) compte moins d'exemplaires après qu'avant : une image déplacée,
      // redimensionnée ou remplacée par un collage identique ne manque pas.
      // Suivent leur cours : Couper (l'image part avec le texte dans le presse-papiers), Annuler et Rétablir, une transaction hors historique ou que le
      // suivi laisse passer (une correction du widget, « Tout accepter » et « Tout refuser »), le suivi des modifications actif, une image sélectionnée
      // (le remplacement est un geste sur elle), tout le document remplacé (Ctrl + A, un modèle chargé) et un remplacement qui se ferme hors d'un texte
      // (un tableau supprimé : rien où poser l'image).
      const TextSelection = EditorCore.getTextSelectionClass();
      const { selection } = oldState;
      const root = trs[0];
      if (!(selection instanceof TextSelection) || !root.docChanged || root.getMeta('appendedTransaction')) return null;
      if (trs.some(tr => tr.getMeta('history$') || tr.getMeta('addToHistory') === false || tr.getMeta('uiEvent') === 'cut' || tr.getMeta(keepKey) || TrackChanges.isSkipped(tr))) return null;
      if (Editor.isTrackChangesOn()) return null;
      const range = replacedTextRange(root, selection, oldState.doc);
      if (!range) return null;
      const inside = [];
      oldState.doc.nodesBetween(range.from, range.to, (node, pos) => { if (isFloatingImage(node)) inside.push({ node, pos }); });
      if (!inside.length) return null;
      if (!selection.empty && selection.from <= TextSelection.atStart(oldState.doc).from && selection.to >= TextSelection.atEnd(oldState.doc).to) return null;
      if (wholeDocReplaced(trs)) return null;
      // Chaque image d'après réclame d'abord une image d'avant hors de la plage, de même sorte ; celles de la plage qui restent sans image d'après ont disparu.
      const left = imagesOf(newState.doc).map(({ node }) => node);
      const claim = node => { const at = left.findIndex(other => sameImage(other, node)); if (at >= 0) left.splice(at, 1); return at >= 0; };
      imagesOf(oldState.doc).forEach(({ node, pos }) => { if (pos < range.from || pos >= range.to) claim(node); });
      const gone = inside.filter(({ node }) => !claim(node));
      if (!gone.length) return null;
      const tr = newState.tr;
      let added = 0;
      gone.forEach(({ node, pos }) => {
        const at = trs.reduce((mapped, step) => step.mapping.map(mapped, 1), pos);
        if (!newState.doc.resolve(at).parent.inlineContent) return;
        tr.insert(at + added, node);
        added += node.nodeSize;
      });
      if (!tr.docChanged) return null;
      // Le curseur ne passe pas derrière les ancres reposées à côté de lui sauf sans texte devant (caretBeside) : la lettre d'après se joint au texte tapé.
      const caret = newState.selection;
      if (caret instanceof TextSelection) {
        const place = pos => caretBeside(tr.doc, tr.mapping.map(pos, -1));
        tr.setSelection(TextSelection.create(tr.doc, place(caret.anchor), place(caret.head)));
      }
      return tr.setMeta(keepKey, true);
    }
    return { keepImagesOfReplacedText };
  })();

  const { createFloatingImageKeysExtension } = (function () {
    // Images en calque : l'extension

    function createFloatingImageKeysExtension(Extension, Plugin, PluginKey) {
      // Retour arrière et Suppr n'emportent plus une image en calque avec le texte qui l'entoure : elle ne part que par un geste sur elle-même, un clic
      // ou sa poignée qui la sélectionne puis Suppr, ou le bouton « Supprimer » de sa barre. Une extension à part, rangée comme celle d'une valeur
      // conditionnelle (après StarterKit, donc essayée avant ses touches).
      // - Curseur seul, une ancre juste derrière lui (Retour arrière) ou juste devant (Suppr) : le curseur passe de l'autre côté, il ne bouge pas à
      //   l'écran, et la touche suit son cours - elle efface le caractère voisin, ou joint la ligne à sa voisine, comme si l'ancre n'était pas là. Une
      //   ligne qui ne porte que l'image (elle semble vide) se joint ainsi à celle d'avant, l'image avec elle.
      // - Texte sélectionné avec une ancre dedans (triple clic sur une ligne, Maj + flèches) : le texte part comme d'habitude, les images en calque de
      //   la sélection sont reposées là où elle se referme, dans la même étape d'annulation.
      // - Texte tapé, Entrée, texte collé ou composé sur un texte sélectionné qui contient une ancre, mot effacé en entier (Ctrl + Suppr) : aucune de
      //   ces touches n'est jouée ici (le navigateur remplace le texte lui-même), la garde `keepImagesOfReplacedText` pose donc les images au même
      //   endroit après le remplacement.
      // - Une image au fil du texte (la classique), curseur seul juste derrière elle (Retour arrière) ou juste devant (Suppr) : la touche la
      //   sélectionne au lieu de l'effacer ; la touche suivante, sur l'image sélectionnée, l'efface, et Annuler la rend. Les ancres collées au
      //   curseur sont enjambées d'abord : l'image à côté du curseur est celle que l'écran montre. Suivi des modifications actif, la touche suit son
      //   cours (la bibliothèque marque l'image supprimée, puis le curseur passe par-dessus).
      // - Le reste suit son cours : une image sélectionnée part, tout le document sélectionné (Ctrl + A, ou un texte qui le couvre en entier) aussi, et
      //   suivi des modifications actif la bibliothèque marque la suppression (js/track-changes.js).
      const keepKey = new PluginKey('floatingImageKeep');
      return Extension.create({
        name: 'floatingImageKeys',
        addKeyboardShortcuts() {
          return Object.assign(keys(['Backspace', 'Shift-Backspace', 'Mod-Backspace', 'Alt-Backspace'], -1), keys(['Delete', 'Mod-Delete', 'Alt-Delete'], 1));
        },
        addProseMirrorPlugins() {
          return [new Plugin({ key: keepKey, appendTransaction: (trs, oldState, newState) => keepImagesOfReplacedText(keepKey, trs, oldState, newState) })];
        },
      });
    }
    return { createFloatingImageKeysExtension };
  })();

  const { behindImageViews, createBehindImageClickThroughExtension } = (function () {
    // Images derrière le texte : les clics qui passent à travers

    // Les cadres des images « derrière le texte » vivants (un par NodeView, cf. applyImageAttrs) : le survol de l'éditeur les passe en revue sans chercher
    // dans le document.
    const behindImageViews = new Set();

    // Une image « derrière le texte » est peinte sous le texte, mais son cadre (le `<span class="editor-image-view">`) reste au-dessus : sa poignée de
    // déplacement, enfant du cadre, doit rester atteignable (cf. applyImageAttrs). Il recevait donc aussi les clics tombés sur le texte posé sur l'image : un
    // clic sur une ligne sélectionnait l'image, et Suppr l'effaçait au lieu du texte. Le survol décide : quand le pointeur est sur un caractère,
    // le cadre laisse passer les clics (`editor-image-click-through`, css/editor-v2.css - ses poignées gardent les leurs) et le clic, le double clic,
    // le triple clic et le glissé tombent sur le texte ; ailleurs sur l'image, le clic la sélectionne comme avant. Un mouvement précède toujours un
    // clic : l'état est prêt quand le bouton s'enfonce.
    function createBehindImageClickThroughExtension(Extension, Plugin, PluginKey) {
      // Le point est-il sur la ligne que ce rectangle de texte occupe ? La ligne compte en entier en hauteur (interligne compris), à un pixel près
      // de chaque côté en largeur.
      function onTextLine(rect, lineHeight, x, y) {
        const half = lineHeight > rect.height ? lineHeight / 2 : rect.height / 2;
        const middle = (rect.top + rect.bottom) / 2;
        return x >= rect.left - 1 && x <= rect.right + 1 && y >= middle - half && y <= middle + half;
      }
      // Le pointeur est-il sur un caractère ? Le cadre est déjà transparent aux clics : l'élément sous le pointeur est ce qu'il y a derrière. La ligne
      // compte en entier en hauteur (interligne compris), pas le seul corps de ses lettres : entre deux lignes le clic reste au texte. Seul le bloc de
      // texte sous le pointeur est parcouru (jamais un tableau ou une zone entière : le coût d'un mouvement ne dépend pas de la taille du document).
      function overText(view, x, y) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit === view.dom || !view.dom.contains(hit) || hit.closest('.editor-image-view')) return false;
        const el = hit.closest('p, h1, h2, h3, h4, h5, h6, pre');
        if (!el || !view.dom.contains(el)) return false;
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.nodeValue.trim() || node.parentElement.closest('.editor-image-view')) continue;
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (onTextLine(rect, lineHeight, x, y)) return true;
          }
        }
        return false;
      }
      return Extension.create({
        name: 'behindImageClickThrough',
        addProseMirrorPlugins() {
          return [new Plugin({
            key: new PluginKey('behindImageClickThrough'),
            props: {
              handleDOMEvents: {
                mousemove: (view, event) => {
                  // Un geste commencé (bouton enfoncé : un glissé de sélection, le glissé d'une poignée) garde l'état où il a commencé.
                  if (event.buttons) return false;
                  const under = [];
                  behindImageViews.forEach(wrap => {
                    if (!view.dom.contains(wrap)) return;
                    const box = wrap.getBoundingClientRect();
                    if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) under.push(wrap);
                    else wrap.classList.remove('editor-image-click-through');
                  });
                  // Tous les cadres sous le pointeur deviennent transparents aux clics le temps de voir ce qu'il y a derrière (deux images qui se recouvrent
                  // se cachent l'une l'autre sinon), puis le reprennent si ce n'est pas du texte.
                  under.forEach(wrap => wrap.classList.add('editor-image-click-through'));
                  if (under.length && !overText(view, event.clientX, event.clientY)) under.forEach(wrap => wrap.classList.remove('editor-image-click-through'));
                  return false;
                },
              },
            },
          })];
        },
      });
    }
    return { behindImageViews, createBehindImageClickThroughExtension };
  })();

  const { moveImageNode, imageAttributes } = (function () {
    // Image : écrire un déplacement et les attributs du nœud

    // Écrit la nouvelle position d'une image en calque que la personne vient de déplacer : une seule voie pour le glisser de la NodeView (`onMoveUp`)
    // et les flèches du clavier (`nudgeSelectedImage`, js/floating-toolbars.js). `patch` : left, top et la grille page (pageIndex, pageLeftPt,
    // pageTopPt). Rend true si le document a changé. Rien ne s'écrit quand aucune valeur ne change (un simple clic sur l'image déjà sélectionnée, une
    // flèche contre le bord de la page) : ni étape d'historique, ni suggestion.
    // Suivi des modifications actif, l'écriture est suivie : la bibliothèque laisse l'image d'origine en suppression suggérée et pose la copie à la
    // nouvelle position en insertion suggérée (accepter garde la copie, refuser rend l'original). La copie est resélectionnée : sinon la flèche
    // suivante ferait avancer le curseur et la barre de l'image se fermerait. Une image déjà insérée par une suggestion (la copie du premier appui
    // d'une rafale, d'un déplacement précédent) se déplace en place, hors suivi : sa suggestion couvre déjà sa position, et une trace par appui
    // empilerait les copies. Une image en suppression suggérée ne bouge pas : elle attend d'être acceptée ou refusée.
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
      // Sans suivi, ou sur une image déjà insérée : le nœud est remplacé (setNodeMarkup) et la NodeSelection recréée dessus dans la même transaction
      // (cf. EditorCore.patchNodeAndReselect), avec la classe de la sélection courante - d'abord posée sur l'image si ce n'était pas elle (glisser par
      // la poignée d'une image non sélectionnée).
      if (!editor.state.selection.node) editor.commands.setNodeSelection(pos);
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, attrs);
      tr.setSelection(editor.state.selection.constructor.create(tr.doc, pos));
      editor.view.dispatch(TrackChanges.skipTracking(tr));
      return true;
    }

    const noBareRender = () => ({});

    function imageAttributes() {
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
        // Position « grille page » : capturée une fois, directement sur le rendu réel de l'éditeur (Aperçu A4), au moment où l'image est
        // positionnée (setLayer, glisser, aligner) ; pdf-export.js l'utilise telle quelle, sans reconstruction ni ancrage textuel, pour un rendu
        // identique entre l'éditeur et le PDF. `null` = jamais positionnée ainsi (document ancien, ou positionnée hors Aperçu A4) : repli sur
        // l'ancien système.
        pageIndex: { default: null, parseHTML: el => (el.hasAttribute('data-page-index') ? parseInt(el.getAttribute('data-page-index'), 10) : null), renderHTML: noBareRender },
        pageLeftPt: { default: null, parseHTML: el => (el.hasAttribute('data-page-left-pt') ? parseFloat(el.getAttribute('data-page-left-pt')) : null), renderHTML: noBareRender },
        pageTopPt: { default: null, parseHTML: el => (el.hasAttribute('data-page-top-pt') ? parseFloat(el.getAttribute('data-page-top-pt')) : null), renderHTML: noBareRender },
        // « Sur toutes les pages » (js/page-layer.js) : l'image « derrière le texte » est peinte à la même place de chaque page. Posé par la barre
        // flottante, effacé dès que l'image quitte « derrière le texte » ; sans grille page il ne produit rien (PageLayer.isRepeatedAttrs).
        repeat: { default: false, parseHTML: el => el.getAttribute('data-repeat') === 'true', renderHTML: noBareRender },
        // Posés ensemble : transforment ce nœud en placeholder de #Variable Attachments (jamais de vraie image dans l'éditeur).
        varTable: { default: null, parseHTML: el => el.getAttribute('data-var-table') || null, renderHTML: noBareRender },
        varColumn: { default: null, parseHTML: el => el.getAttribute('data-var-column') || null, renderHTML: noBareRender },
        varKey: { default: null, parseHTML: el => el.getAttribute('data-var-key') || null, renderHTML: noBareRender },
        // QR code (js/qr-code.js) : le texte à encoder, « #Table.Colonne » compris. Posé avec un `src`, l'image est le QR code déjà dessiné ; sans
        // `src`, le texte contient une colonne et le QR code n'est dessiné qu'à la Lecture et à l'export, pour la ligne affichée
        // (reader-mode.js:resolveQrCodes).
        qrText: { default: null, parseHTML: el => el.getAttribute('data-qr-text') || null, renderHTML: noBareRender },
      };
    }
    return { moveImageNode, imageAttributes };
  })();

  const { imageViewDom, applyImageAttrs } = (function () {
    // Image : le cadre de la vue et ses attributs

    function imageViewDom() {
      // NodeView : les poignées sont de vrais enfants DOM du wrapper, positionnées en pur CSS.
      const wrap = document.createElement('span');
      wrap.className = 'editor-image-view';
      const img = document.createElement('img');
      img.className = 'editor-image';
      img.draggable = false;
      wrap.appendChild(img);

      // Placeholder de #Variable : <span> superposé (icône + "#Table.Colonne") plutôt que de compter sur le rendu natif d'un <img src="">. Le
      // <img> reste dans le DOM, invisible, pour continuer à porter width/height (poignées, toolbar flottante).
      const varLabel = document.createElement('span');
      varLabel.className = 'editor-image-var-label';
      wrap.appendChild(varLabel);

      // Image d'un autre site pas encore affichée (js/external-images.js) : l'<img> n'a pas d'adresse, le cadre montre le site et le vrai bouton
      // « Afficher » (le clic affiche toutes les images de ce site, pour la session). Caché tant que l'image n'est pas bloquée.
      const blockedBox = document.createElement('span');
      blockedBox.className = 'editor-image-blocked-box';
      const blockedSiteLabel = document.createElement('span');
      blockedSiteLabel.className = 'editor-image-blocked-site';
      const revealButton = document.createElement('button');
      revealButton.type = 'button';
      revealButton.className = 'editor-image-reveal';
      revealButton.addEventListener('click', () => ExternalImages.allow(wrap.dataset.blockedSite));
      blockedBox.appendChild(blockedSiteLabel);
      blockedBox.appendChild(revealButton);
      wrap.appendChild(blockedBox);

      const moveHandle = document.createElement('span');
      moveHandle.className = 'editor-image-move-handle';
      moveHandle.title = I18n.t('image.moveHandle');
      wrap.appendChild(moveHandle);
      const corners = {};
      ['nw', 'ne', 'sw', 'se'].forEach(corner => {
        const h = document.createElement('span');
        h.className = 'editor-image-handle editor-image-handle-' + corner;
        wrap.appendChild(h);
        corners[corner] = h;
      });
      return { wrap, img, varLabel, blockedSiteLabel, revealButton, moveHandle, corners };
    }

    function imageInnerStyle(attrs, isVarBox, isQrBox) {
      const imgStyle = [];
      if (attrs.width) imgStyle.push(`width: ${attrs.width}`);
      if (isVarBox && attrs.height) imgStyle.push(`height: ${attrs.height}`);
      if (isQrBox) imgStyle.push('aspect-ratio: 1 / 1');
      if (attrs.opacity !== 1 && attrs.opacity != null) imgStyle.push(`opacity: ${attrs.opacity}`);
      if (attrs.layer !== 'normal') imgStyle.push('position: relative', `z-index: ${attrs.layer === 'front' ? 5 : -1}`);
      return imgStyle.join('; ');
    }

    function applyImageFrame(view, attrs, layered) {
      const { wrap, moveHandle } = view;
      if (layered) {
        wrap.style.position = 'absolute';
        wrap.style.left = (attrs.left || 0) + 'px';
        wrap.style.top = (attrs.top || 0) + 'px';
        // Largeur explicite (pas de shrink-to-fit implicite) : dans une cellule de tableau étroite, le shrink-to-fit par défaut s'effondre à 0
        // quand l'image approche la largeur du bloc englobant.
        wrap.style.width = attrs.width || '';
      } else {
        wrap.style.position = ''; wrap.style.left = ''; wrap.style.top = ''; wrap.style.width = '';
      }
      moveHandle.style.display = layered ? '' : 'none';
      if (attrs.align) wrap.setAttribute('data-align', attrs.align); else wrap.removeAttribute('data-align');
      wrap.setAttribute('data-wrap', attrs.wrap || 'inline');
    }

    function applyImageAttrs(view, attrs) {
      // Le z-index négatif ("derrière le texte") est posé sur l'<img> seule, pas le wrapper : sinon la poignée de déplacement (enfant du wrapper)
      // serait entraînée derrière le texte avec lui, devenant impossible à re-sélectionner une fois cachée.
      const { wrap, img, varLabel } = view;
      const isVarBox = !!attrs.varTable;
      // Un QR code dont le texte contient une colonne : le même cadre qu'une image de variable, carré, avec son texte pour libellé.
      const isQrBox = !!attrs.qrText && !attrs.src && !isVarBox;
      // Une image d'un autre site que la personne n'a pas affiché : pas d'adresse donnée au navigateur (le modèle, lui, la garde), un cadre à la place.
      const blockedSite = isVarBox ? '' : ExternalImages.blockedSiteOf(attrs.src);
      img.src = (isVarBox || blockedSite) ? '' : (attrs.src || '');
      wrap.classList.toggle('editor-image-blocked', !!blockedSite);
      if (blockedSite) {
        wrap.dataset.blockedSite = blockedSite;
        view.blockedSiteLabel.textContent = blockedSite;
        view.revealButton.textContent = I18n.t('image.blocked.show');
        view.revealButton.title = ExternalImages.hintOf(blockedSite);
        view.revealButton.setAttribute('aria-label', I18n.t('image.blocked.alt', { site: blockedSite }));
      } else delete wrap.dataset.blockedSite;
      img.alt = attrs.alt || '';
      img.setAttribute('style', imageInnerStyle(attrs, isVarBox, isQrBox));
      wrap.classList.toggle('editor-image-var-placeholder', isVarBox || isQrBox);
      wrap.classList.toggle('editor-image-qr-placeholder', isQrBox);
      varLabel.textContent = isVarBox ? ('#' + (attrs.varKey || '')) : (isQrBox ? attrs.qrText : '');
      const layered = attrs.layer !== 'normal';
      wrap.classList.toggle('editor-image-layered', layered);
      wrap.classList.toggle('editor-image-repeated', PageLayer.isRepeatedAttrs(attrs));
      if (attrs.layer === 'behind') behindImageViews.add(wrap); else { behindImageViews.delete(wrap); wrap.classList.remove('editor-image-click-through'); }
      applyImageFrame(view, attrs, layered);
    }
    return { imageViewDom, applyImageAttrs };
  })();

  const { imageResizeGesture } = (function () {
    // Image : le redimensionnement à la souris

    function imageResizeGesture(view, node, nodeEditor, getPos) {
      const { wrap, img } = view;
      // Le retour visuel de sélection (classe CSS) n'est pas géré ici ni par selectNode/deselectNode (peu fiable après un setNodeMarkup qui
      // remplace le nœud) : wireImageFloatingToolbar.check() le recalcule à chaque transaction d'après la sélection.
      function updateAttrs(patch) {
        const live = liveNode(nodeEditor, getPos);
        if (live) EditorCore.patchNodeAndReselect(nodeEditor, live.pos, Object.assign({}, live.node.attrs, patch));
      }

      // Attributs courants - jamais `node.attrs` directement : ce paramètre de closure ne reflète que le premier rendu de cette NodeView.
      function currentAttrs() {
        const live = liveNode(nodeEditor, getPos);
        return (live ? live.node : node).attrs;
      }

      let resizeState = null;
      function startResize(event, corner) {
        event.preventDefault(); event.stopPropagation();
        const rect = img.getBoundingClientRect();
        const attrsNow = currentAttrs();
        // La souris et getBoundingClientRect parlent en pixels écran, `width`/`height` s'écrivent en pixels de mise en page : la feuille est
        // réduite à ~0,85 dans un panneau de ~700 px (cf. EditorCore.layoutZoom).
        const zoom = EditorCore.layoutZoom(wrap);
        resizeState = {
          startX: event.clientX, startY: event.clientY, zoom,
          startWidth: rect.width / zoom, startHeight: rect.height / zoom,
          signX: corner.includes('w') ? -1 : 1, signY: corner.includes('n') ? -1 : 1,
          isVarBox: !!attrsNow.varTable,
          // En calque, `wrap` a une largeur explicite (cf. applyImageAttrs) ; sans la faire grandir aussi pendant le glisser (pas seulement à la fin),
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
      return { start: startResize, release: () => document.removeEventListener('mousemove', onResizeMove) };
    }
    return { imageResizeGesture };
  })();

  const { imageNodeView } = (function () {
    // Image : le déplacement à la souris et la vue

    function imageMoveGesture(view, node, nodeEditor, getPos, applyAttrs) {
      const { wrap } = view;
      let moveState = null;
      function startMove(event) {
        const live = liveNode(nodeEditor, getPos);
        const current = live ? live.node : node;
        // Une image en suppression suggérée (l'original d'un déplacement suivi) attend d'être acceptée ou refusée : elle ne se glisse pas, le
        // clic reste un clic.
        if (current.marks.some(m => m.type.name === 'deletion')) return;
        event.preventDefault(); event.stopPropagation();
        // Déplacement de la souris en pixels écran, `left`/`top` en pixels de mise en page (cf. startResize) : sans la division, l'image traînait
        // derrière le pointeur.
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
          // Lu après computePageGridPosition (et non recalculé depuis event.clientX/Y) : cette fonction repositionne `wrap` si le glisser sort de
          // la page physique, offsetLeft/offsetTop reflètent alors la position corrigée, jamais désynchronisée de la grille.
          const patch = { left: Math.round(wrap.offsetLeft), top: Math.round(wrap.offsetTop) };
          if (grid) Object.assign(patch, grid);
          // Même voie que les flèches du clavier : en suivi, le déplacement laisse sa trace (l'original barré, la copie à la nouvelle place).
          // Rien ne s'écrit sans changement (un simple clic sur l'image déjà sélectionnée) ni sur une image en suppression suggérée : le DOM, que
          // le glisser a déplacé en direct, retrouve alors la position du document.
          const live = liveNode(nodeEditor, getPos);
          if (live && !moveImageNode(nodeEditor, live.pos, patch)) applyAttrs(live.node.attrs);
        }
        moveState = null;
      }
      return { start: startMove, release: () => document.removeEventListener('mousemove', onMoveMove) };
    }

    // Les vues d'image qui attendent peut-être le clic « Afficher » d'un site : chacune se redessine d'après ses attributs quand un site est affiché
    // (js/external-images.js). L'abonnement est pris à la première vue : le module de l'éditeur se charge avant celui des images d'un autre site.
    const revealHooks = new Set();
    let revealHooked = false;
    function hookReveal() {
      if (revealHooked) return;
      revealHooked = true;
      const redrawAll = () => revealHooks.forEach(hook => hook());
      ExternalImages.onReveal(redrawAll);
      I18n.onChange(redrawAll); // le bouton « Afficher » et son nom accessible suivent la langue
    }

    function imageNodeView({ node, editor: nodeEditor, getPos }) {
      const view = imageViewDom();
      const { wrap, img, moveHandle } = view;
      let shown = node.attrs;
      const applyAttrs = attrs => { shown = attrs; applyImageAttrs(view, attrs); };
      const redraw = () => applyImageAttrs(view, shown);
      hookReveal();
      revealHooks.add(redraw);
      applyAttrs(node.attrs);
      const resize = imageResizeGesture(view, node, nodeEditor, getPos);
      const move = imageMoveGesture(view, node, nodeEditor, getPos, applyAttrs);
      Object.entries(view.corners).forEach(([corner, handle]) => handle.addEventListener('mousedown', event => resize.start(event, corner)));
      moveHandle.addEventListener('mousedown', move.start);
      // Une fois sélectionnée, l'image se glisse directement au clic (pas seulement par la poignée de déplacement) ; le tout premier clic suit le
      // chemin normal de sélection de ProseMirror.
      img.addEventListener('mousedown', event => {
        if (!wrap.classList.contains('editor-image-layered')) return;
        if (!wrap.classList.contains('editor-image-selected')) return;
        move.start(event);
      });
      return {
        dom: wrap,
        update: updatedNode => {
          if (updatedNode.type.name !== 'editorImage') return false;
          applyAttrs(updatedNode.attrs);
          return true;
        },
        selectNode: () => wrap.classList.add('editor-image-selected'),
        deselectNode: () => wrap.classList.remove('editor-image-selected'),
        // Le bouton « Afficher » d'une image bloquée est à lui : ni sélection de l'image, ni glissé, ni autre geste de l'éditeur sur son clic.
        stopEvent: event => !!event.target.closest && !!event.target.closest('.editor-image-blocked-box'),
        destroy: () => {
          revealHooks.delete(redraw);
          behindImageViews.delete(wrap);
          resize.release();
          move.release();
        },
      };
    }
    return { imageNodeView };
  })();

  const { createEditorImageNode, createPageBreakNode } = (function () {
    // Image : le nœud ; le saut de page

    // Image : nœud atome en ligne (`layer` normal/devant/derrière, `opacity`, `align`, `wrap`). Chaque attribut garde un renderHTML vide : le nœud
    // construit lui-même la chaîne `style` complète ci-dessous.
    function createEditorImageNode(Node) {
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
      return inlineAtom(Node, {
        name: 'editorImage',
        addAttributes() { return imageAttributes(); },
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
        addNodeView() { return imageNodeView; },
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
    return { createEditorImageNode, createPageBreakNode };
  })();

  const { createHeadingNumberingConfigNode, createTocNode } = (function () {
    // La numérotation des titres et le sommaire

    // Numérotation des titres : configuration persistée comme un nœud du contenu plutôt que dans une colonne Grist séparée (pas de migration de
    // schéma). L'attribut s'appelle `numberingStyle` et non `style` (collision HTML).
    function createHeadingNumberingConfigNode(Node) {
      return Node.create({
        name: 'headingNumberingConfig',
        group: 'block',
        atom: true,
        selectable: false,
        addAttributes() {
          return { numberingStyle: internalAttr('none') };
        },
        parseHTML() {
          return [{ tag: 'div.heading-numbering-config', getAttrs: el => ({ numberingStyle: el.dataset.style || 'none' }) }];
        },
        renderHTML({ node }) {
          return ['div', { class: 'heading-numbering-config', contenteditable: 'false', 'data-style': node.attrs.numberingStyle }];
        },
        addCommands() {
          return {
            // Un seul nœud de config par document : cherche parmi les enfants directs (doc.forEach), sinon l'insère en tête. `dispatch` peut être
            // absent (mode "can-run") - ne muter `tr` que s'il est présent.
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

    // Sommaire - nœud atome de bloc. Le HTML sérialisé reste un placeholder (résolu par reader-mode.js/pdf-export.js) ; l'éditeur affiche un aperçu
    // vivant via un NodeView, isolé du modèle par `ignoreMutation`. Le texte du placeholder suit la langue de l'interface (même clé que le NodeView) :
    // il n'est lu par personne au rechargement (`parseHTML` ne regarde que la classe), mais Ctrl+C le colle tel quel dans un autre document ou une
    // autre application.
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
    return { createHeadingNumberingConfigNode, createTocNode };
  })();


  return {
    createVarBadgeNode, createCalcBadgeNode, createCalcBadgeKeysExtension, createPageNumberBadgeNode, createSmartChipNode, createFootnoteRefNode, createCommentMark,
    createFontSizeExtension, createTextColorExtension, createHighlightExtension,
    createBulletStyleExtension, createOrderedListStyleExtension, createTaskListStyleExtension,
    withCellBackground, withFastColwidth, parseColwidthOnce, createTableView, createTabNavigationExtension, createClearHistoryExtension,
    createTwoColumnsNodes, createConditionalTextNode, createConditionalCheckboxNode, createConditionalValueNode, createConditionalValueKeysExtension, createFloatingImageKeysExtension, createBehindImageClickThroughExtension, createEditorImageNode, moveImageNode, createPageBreakNode,
    createHeadingNumberingConfigNode, createTocNode,
  };
})();
