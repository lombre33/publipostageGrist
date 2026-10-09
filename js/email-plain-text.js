// Modèle email : l'éditeur n'écrit que ce que le lien mailto: porte (js/mailto-export.js). Le corps d'un mailto: est du texte brut : ni gras, ni
// italique, ni souligné, ni barré, ni code en ligne, ni couleur, taille, police, surlignage ou alignement ne survivent, ni un niveau de titre (une
// taille et un poids), et une image non plus. La barre d'outils les grise déjà (MainToolbar.syncLocks) ; ce module ferme les autres chemins par
// lesquels ils entraient, pour que le modèle ne montre que ce que le destinataire lira (le raccourci de gras mettait encore en gras dans un email
// dont le bouton Gras est grisé) :
//   1) les touches de TipTap qui posent une de ces mises en forme (Ctrl+B, I, U, E, Ctrl+Maj+S, L, E, R, J, Ctrl+Alt+1 à 6) ne font rien ;
//   2) les signes de Markdown tapés (`**gras**`, `*italique*`, `~~barré~~`, `code`, `__gras__`, `_italique_`, `# `) restent du texte : les règles de
//      saisie de TipTap les mangeraient pour poser une mise en forme que le lien ne porte pas, et le lien écrit ces signes tels qu'on les a tapés ;
//   3) un collage ou un glisser-déposer perd ces marques, l'alignement et les images, et ses titres deviennent des lignes simples, mais garde ce que
//      le texte brut dit (lignes, listes, citations, blocs de code, liens) ;
//   4) un texte brut collé garde ses lignes vides (ProseMirror compte plusieurs retours à la ligne de suite pour un seul), puisque chaque ligne vide
//      du modèle est une ligne vide du lien ;
//   5) une mise en forme restée dans un modèle plus ancien (gras sur des bulles, titre par exemple), ou arrivée d'un autre chemin (règle de collage
//      de Markdown, expansion de texte), ne s'affiche plus dans l'éditeur ni à la Lecture (css/email-plain-text.css, sous la classe `pp-email-model`
//      que ce module pose sur <body>) : le modèle enregistré n'est pas touché, seul l'affichage est neutre.
// Hors d'un modèle email (document, grille, macro-modèle), le module ne fait rien. Les listes, citations, blocs de code et liens, que le texte brut
// garde (sous une forme plus simple), restent possibles.
const EmailPlainText = (function () {
  const BODY_CLASS = 'pp-email-model';
  let active = false;

  // Les marques qui ne passent pas en texte brut. `textStyle` porte la couleur, la taille, la police et le surlignage. Les liens, les commentaires et
  // les marques du suivi des modifications restent.
  const DROPPED_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'textStyle']);
  const isDropped = mark => DROPPED_MARKS.has(mark.type.name);

  // Les touches de TipTap qui posent une de ces mises en forme, relevées en pressant chaque touche avec Ctrl, Ctrl+Maj, Ctrl+Alt dans un modèle email,
  // au vrai clavier. Les capitales sont les variantes de TipTap pour Maj ou Verr. Maj : « Mod-I » attrape donc aussi Ctrl+Maj+I (la
  // recherche d'une touche essaie le nom sans Maj), qui met en italique comme Ctrl+I. Ni les listes (Ctrl+Maj+7, 8, 9) ni le bloc de code (Ctrl+Alt+C)
  // n'y sont : le texte brut les écrit. La citation (Ctrl+Maj+B) non plus, d'où « Mod-B » à part (plus bas) : dans cette liste il l'aurait prise pour
  // du gras. Les niveaux de titre (Ctrl+Alt+1 à 6) sont dans la liste qui suit : le texte brut écrit la ligne du titre, pas son niveau. Ctrl+Alt+0
  // (revenir au paragraphe) reste libre.
  const FORMAT_KEYS = [
    'Mod-b', 'Mod-i', 'Mod-I', 'Mod-u', 'Mod-U', 'Mod-e', 'Mod-E', 'Mod-Shift-s', 'Mod-Shift-S',
    'Mod-Shift-l', 'Mod-Shift-L', 'Mod-Shift-e', 'Mod-Shift-E', 'Mod-Shift-r', 'Mod-Shift-R', 'Mod-Shift-j', 'Mod-Shift-J',
  ];
  // Les six niveaux de titre de TipTap. Les trois premiers ont aussi une action de js/shortcuts.js (Alt+Maj+1 à 3, et Ctrl+Alt+1 à 3 en synonyme)
  // qui clique la ligne du menu Titre : grisée dans un email, elle ne fait rien. Les niveaux 4 à 6 n'ont que la touche de TipTap.
  const HEADING_KEYS = [1, 2, 3, 4, 5, 6].map(level => 'Mod-Alt-' + level);
  // Ctrl+B avec Verr. Maj. est un « B » capital sans Maj (la variante « Mod-B » de TipTap pour le gras). Seule la frappe elle-même la distingue de
  // Ctrl+Maj+B, la citation, que le nom de touche de TipTap confond avec lui.
  const isCapsBold = event => (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === 'B';

  // Les règles de saisie de Markdown de TipTap (gras, italique, barré, code en ligne) se déclenchent à la frappe de leur dernier signe : `*`, `_`, `~`
  // ou une apostrophe inversée. Celle des listes (« - », « * », « 1. »), de la citation (« > ») et du bloc de code se déclenchent sur l'espace ou le
  // retour à la ligne qui suit : elles ne sont pas touchées, le texte brut écrit ces lignes. Celle des titres aussi (l'espace après un à six « # » en
  // début de ligne), mais le texte brut n'écrit pas un niveau de titre : la touche espace est alors insérée telle quelle, et « # Titre » reste ce qu'on a tapé.
  const MARK_RULE_ENDINGS = /[*_~`]$/;
  const HEADING_SIGNS = /^#{1,6}$/;
  // Ce que `textBetween` écrit pour un nœud sans texte (une bulle) : jamais un « # ».
  const LEAF_TEXT = String.fromCharCode(0xFFFC);
  const textBefore = $pos => $pos.parent.textBetween(0, $pos.parentOffset, null, LEAF_TEXT);
  function isHeadingRuleSpace(view, from, text) {
    return /^\s$/.test(text) && HEADING_SIGNS.test(textBefore(view.state.doc.resolve(from)));
  }
  // Entrée lance aussi les règles de saisie de TipTap (avec « \n » comme texte, pour le bloc de code) : un à six « # » seuls devant le curseur deviendraient
  // un titre vide, le signe mangé et la ligne jamais coupée. Entrée fait alors ce que font les plugins placés après la règle de saisie (couper la ligne,
  // ouvrir un item de liste, une suggestion ouverte), comme si cette règle n'existait pas. Les règles des listes (« - ») et de la citation (« > ») gardent
  // leur geste sur Entrée.
  function isHeadingSignsEnter(view, event) {
    const $cursor = view.state.selection.$cursor;
    return event.key === 'Enter' && !!$cursor && HEADING_SIGNS.test(textBefore($cursor));
  }
  function enterWithoutInputRules(view, event, self) {
    const plugins = view.state.plugins;
    for (let i = plugins.indexOf(self) + 1; i < plugins.length; i++) {
      const handler = plugins[i].spec.isInputRules ? null : plugins[i].props.handleKeyDown;
      if (handler && handler(view, event)) return true;
    }
    return false;
  }
  // Le signe est inséré comme le fait ProseMirror (`deflt` est sa transaction par défaut) sans passer par les règles de saisie, placées après ce plugin
  // (priorité 1000).
  function handleTextInput(view, from, to, text, deflt) {
    if (!active || !(MARK_RULE_ENDINGS.test(text) || isHeadingRuleSpace(view, from, text))) return false;
    const tr = typeof deflt === 'function' ? deflt() : view.state.tr.insertText(text, from, to);
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  function setActive(on) {
    active = !!on;
    document.body.classList.toggle(BODY_CLASS, active);
  }
  function isActive() { return active; }

  // Un nœud (et ce qu'il contient) sans les marques, l'alignement et les images qui ne passent pas, et un titre devenu un paragraphe ; le même nœud
  // quand rien ne change, null pour une image. Les marques d'une bulle (inline, sans texte) partent aussi : c'est là que se trouve le gras d'une
  // notification dont les bulles ont été mises en gras.
  function cleanNode(node) {
    if (node.type.name === 'editorImage') return null;
    const marks = node.marks.some(isDropped) ? node.marks.filter(mark => !isDropped(mark)) : node.marks;
    if (node.isLeaf) return marks === node.marks ? node : node.mark(marks);
    const attrs = node.attrs.textAlign ? Object.assign({}, node.attrs, { textAlign: null }) : node.attrs;
    const flatten = node.type.name === 'heading';
    const children = [];
    let changed = flatten || marks !== node.marks || attrs !== node.attrs;
    node.forEach(child => {
      const cleaned = cleanNode(child);
      if (cleaned !== child) changed = true;
      if (cleaned) children.push(cleaned);
    });
    // Le paragraphe ignore le niveau du titre (ProseMirror ne garde que les attributs que le type déclare) : ses autres attributs, l'alignement
    // exclu, sont ceux qu'un titre a en commun avec lui.
    const type = flatten ? node.type.schema.nodes.paragraph : node.type;
    return changed ? type.create(attrs, node.content.constructor.fromArray(children), marks) : node;
  }

  // Le contenu collé ou déposé, nettoyé. Même idiome que GridEditor.trimPastedSlice pour recomposer une tranche sans importer ProseMirror.
  function cleanSlice(slice) {
    const blocks = [];
    let changed = false;
    slice.content.forEach(node => {
      const cleaned = cleanNode(node);
      if (cleaned !== node) changed = true;
      if (cleaned) blocks.push(cleaned);
    });
    return changed ? new slice.constructor(slice.content.constructor.fromArray(blocks), slice.openStart, slice.openEnd) : slice;
  }

  // Un texte brut collé : une ligne, un paragraphe, les lignes vides comprises (ProseMirror les fond : ses retours à la ligne de suite en comptent un).
  function textToSlice(text, $context, view) {
    const { schema, doc } = view.state;
    const marks = $context.marks().filter(mark => !isDropped(mark));
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const paragraphs = lines.map(line => schema.nodes.paragraph.create(null, line ? schema.text(line, marks) : null));
    return new (doc.slice(0, 0).constructor)(doc.content.constructor.fromArray(paragraphs), 0, 0);
  }

  function createExtension(Extension, { Plugin, PluginKey }) {
    return Extension.create({
      name: 'emailPlainText',
      // Avant les touches des marques de StarterKit (priorité par défaut), comme GridEditor.createExtension.
      priority: 1000,
      addKeyboardShortcuts() {
        const keys = {};
        // `true` consomme la touche (TipTap la traite alors comme faite, et ProseMirror empêche aussi le gras natif du navigateur) ; `false` la laisse
        // aux marques de StarterKit.
        FORMAT_KEYS.concat(HEADING_KEYS).forEach(key => { keys[key] = () => active; });
        return keys;
      },
      addProseMirrorPlugins() {
        const plugin = new Plugin({
          key: new PluginKey('emailPlainText'),
          props: {
            handleKeyDown: (view, event) => active && (isCapsBold(event) || (isHeadingSignsEnter(view, event) && enterWithoutInputRules(view, event, plugin))),
            handleTextInput,
            transformPasted: slice => (active ? cleanSlice(slice) : slice),
            clipboardTextParser: (text, $context, plain, view) => (active ? textToSlice(text, $context, view) : null),
          },
        });
        return [plugin];
      },
    });
  }

  return { setActive, isActive, createExtension, cleanSlice };
})();
