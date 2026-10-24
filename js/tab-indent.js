// Tabulation : la touche Tab décale le curseur d'un cran de retrait, Maj+Tab le ramène. C'est une vraie tabulation (U+0009) écrite dans le texte, au cran de
// 12,7 mm (un demi-pouce, 720 twips : celui des tabulations par défaut de Word), partout où l'on écrit sur plusieurs lignes - le corps du document, l'en-tête et
// le pied de page (le même éditeur), les blocs de contenu, les encadrés, les citations.
//
// Ce que Tab faisait déjà garde la main (la touche n'arrive ici que si personne ne la prend) : dans une liste à puces ou numérotée elle change le niveau, dans
// une liste ouverte (« # », « § », « @ ») elle choisit, dans une zone à deux colonnes elle passe d'une colonne à l'autre (js/editor-nodes.js:
// createTabNavigationExtension), dans une case de tableau elle va à la case suivante (comme dans Word). Les champs d'une ligne (la barre, les noms de fichier) et les
// petites fenêtres de saisie (note de bas de page, commentaire, réglages) gardent Tab pour passer au champ ou au bouton suivant : le clavier n'en sortirait plus.
//
// Pour que le clavier puisse toujours sortir d'une zone où Tab écrit, Échap puis Tab quitte la zone (l'usage des éditeurs de code : le Tab qui suit un Échap n'écrit
// pas). Le Tab d'un Échap qui ferme déjà autre chose (une liste ouverte, une fenêtre) n'est pas celui-là : seul un Échap que personne n'a pris arme la sortie.
//
// Sélection de plusieurs blocs, ou texte choisi : Tab ajoute une tabulation en tête de chaque bloc choisi et Maj+Tab retire celle de tête, jamais le texte choisi
// (rien n'est remplacé ni effacé). Curseur seul : Tab écrit la tabulation à sa place, Maj+Tab retire celle qui le précède ou, à défaut, celle qui ouvre la ligne.
//
// Dans le document, la tabulation est un petit nœud en ligne, `tabStop` (<span class="pp-tab" style="white-space: pre-wrap">(U+0009)</span>), qui porte les mêmes
// marques que le texte autour (gras, souligné, taille...) : une tabulation soulignée trace sa ligne, comme dans Word. Ce n'est pas un caractère du texte : ProseMirror
// lit le HTML comme le navigateur en écrase les blancs, et efface ceux qui terminent un bloc - une tabulation en fin de paragraphe (une ligne à remplir, soulignée)
// aurait disparu au rechargement du modèle. Un nœud n'est jamais du blanc pour lui : il se relit, se copie et se colle tel qu'il est écrit. Le plugin ci-dessous change
// en nœud toute tabulation brute qui arrive dans le texte (texte collé, abréviation développée, remplacement), sauf dans un bloc de code, qui garde les siennes.
// Un bloc de code n'admet que du texte, et en poser un efface ce qu'il n'admet pas : « Bloc de code » (le bouton, Ctrl+Alt+C) change donc d'abord en tabulations brutes
// les nœuds-tabulation du texte choisi (`tabsToText`), et le plugin les remet en nœuds si le bloc redevient un paragraphe.
//
// Le rendu est le même partout, au cran près que chaque moteur sait écrire :
//  - éditeur, Lecture, en-têtes et pieds de page, mesures du PDF, impression par le navigateur : css/tab-indent.css (`tab-size: 12.7mm`) ; les tabulations se calent
//    sur les crans à partir du début de la ligne. Un paragraphe peut avoir son propre cran (`tab-size`, attribut `data-tab-size` : js/paragraph-format.js, `tabSizeOf`), celui d'un fichier PowerPoint ;
//  - PDF : js/pdf-export.js mesure chaque tabulation dans l'hôte de mesure (sa largeur réelle, au cran où le navigateur l'a posée) et écrit un blanc de cette largeur
//    (`tabRun`) ; pdfmake, lui, remplace une tabulation par quatre espaces ;
//  - Word : une vraie tabulation (`w:tab`) et le cran par défaut de 720 twips (`STOP_TWIPS`), que Word décale comme les siens ;
//  - Markdown : l'entité du cadratin (`&emsp;`) par tabulation : une tabulation ou quatre espaces en tête d'un paragraphe ouvriraient un bloc de code ;
//  - e-mail : le corps d'un lien mailto: est du texte brut, la tabulation y reste une tabulation.
const TabIndent = (function () {
  const NODE = 'tabStop';
  const CLASS = 'pp-tab';
  const TAB = '\t';

  // Le cran de tabulation : le demi-pouce de Word (`w:defaultTabStop` = 720 twips), la valeur de `tab-size` de css/tab-indent.css et, en points, le blanc d'une
  // tabulation que le PDF ne peut pas mesurer.
  const STOP_MM = 12.7;
  const STOP_TWIPS = 720;
  const STOP_PT = STOP_TWIPS / 20;

  // Une tabulation en Markdown : l'entité du cadratin (U+2003). Écrite en entité, elle résiste aux outils qui rognent les blancs d'un texte, et le Markdown la lit comme
  // le caractère.
  const MARKDOWN_TAB = '&emsp;';

  // Vrai quand la position est dans une case de tableau ou de grille, où Tab passe à la case suivante.
  const cellRole = $pos => {
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const role = $pos.node(depth).type.spec.tableRole;
      if (role === 'cell' || role === 'header_cell') return true;
    }
    return false;
  };

  // Le nœud TipTap, à ranger avec les pastilles en ligne (js/editor.js:textExtensions). Il n'a ni contenu ni sélection propre : un clic place le curseur avant ou
  // après, la tabulation ne se choisit pas comme une image. Son HTML porte le caractère, pour que la Lecture, l'impression et les exports le mesurent.
  function createNode(Node) {
    return Node.create({
      name: NODE,
      group: 'inline',
      inline: true,
      atom: true,
      selectable: false,
      draggable: false,
      // Prioritaire sur la règle de TextStyle (un <span style> quelconque, `consuming: false`) : le nœud lit son <span> le premier et le consomme.
      parseHTML() { return [{ tag: `span.${CLASS}`, priority: 60 }]; },
      renderHTML() { return ['span', { class: CLASS, style: 'white-space: pre-wrap' }, TAB]; },
      // Le texte brut d'une sélection copiée, d'une recherche, d'un lien mailto: : le caractère.
      renderText() { return TAB; },
    });
  }

  // La position du début de la ligne où se trouve `$pos` : celui du bloc, ou le caractère qui suit le dernier saut de ligne forcé (Maj+Entrée) avant lui.
  function lineStart($pos) {
    const block = $pos.parent;
    let start = 0;
    block.forEach((child, offset) => {
      if (offset < $pos.parentOffset && child.type.name === 'hardBreak') start = offset + child.nodeSize;
    });
    return $pos.start() + start;
  }

  // Les blocs de texte (paragraphes, titres...) que recouvre la plage `from`-`to`, avec leur position ; ceux d'une case de tableau n'en font pas partie (Tab y garde
  // son rôle de case suivante, ce que le curseur seul respecte déjà).
  function textblocksIn(doc, from, to) {
    const found = [];
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      if (!cellRole(doc.resolve(pos))) found.push({ node, pos });
      return false;
    });
    return found;
  }

  // Plages que les transactions ont changées, dans le document final : de quoi ne relire que les blocs touchés pour y retrouver les tabulations brutes.
  function changedRanges(transactions) {
    const ranges = [];
    transactions.forEach((tr, trIndex) => {
      if (!tr.docChanged) return;
      tr.mapping.maps.forEach((map, mapIndex) => {
        map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
          let from = newStart;
          let to = newEnd;
          const rest = tr.mapping.slice(mapIndex + 1);
          from = rest.map(from, -1);
          to = rest.map(to, 1);
          for (let next = trIndex + 1; next < transactions.length; next += 1) {
            from = transactions[next].mapping.map(from, -1);
            to = transactions[next].mapping.map(to, 1);
          }
          ranges.push([from, to]);
        });
      });
    });
    return ranges;
  }

  // Change en nœud toute tabulation brute des blocs de texte changés : une tabulation collée en texte brut, développée par une abréviation, remplacée ou tapée par un
  // autre chemin que la touche, ou celles d'un bloc de code que l'on remet en paragraphe (le changement de type d'un bloc ne touche que ses bords : on relit tout le
  // bloc). Le nœud prend les marques du caractère. Un texte qui n'admet pas le nœud (le code) garde ses tabulations brutes. Rend la transaction à ajouter, ou null. Elle
  // ne passe pas par le suivi des modifications : ce n'est pas une modification de la personne mais le widget qui remet le texte d'aplomb.
  function convertStrayTabs(transactions, newState) {
    if (!transactions.some(tr => tr.docChanged)) return null;
    const tabType = newState.schema.nodes[NODE];
    if (!tabType) return null;
    const size = newState.doc.content.size;
    const found = new Map();
    const read = new Set();
    changedRanges(transactions).forEach(([from, to]) => {
      const start = Math.max(0, Math.min(from, size));
      const end = Math.max(start, Math.min(to, size));
      newState.doc.nodesBetween(start, end, (block, blockPos) => {
        if (!block.isTextblock) return true;
        if (read.has(blockPos)) return false;
        read.add(blockPos);
        block.forEach((child, offset, index) => {
          if (!child.isText || child.text.indexOf(TAB) < 0 || !block.canReplaceWith(index, index + 1, tabType)) return;
          for (let at = 0; at < child.text.length; at += 1) {
            if (child.text[at] === TAB) found.set(blockPos + 1 + offset + at, child.marks);
          }
        });
        return false;
      });
    });
    if (!found.size) return null;
    const tr = newState.tr;
    // De la fin au début : un nœud prend la place d'un caractère, les positions de devant ne bougent pas.
    Array.from(found.keys()).sort((a, b) => b - a).forEach(pos => tr.replaceWith(pos, pos + 1, tabType.create(null, null, found.get(pos))));
    return TrackChanges.skipTracking(tr);
  }

  // Les nœuds-tabulation des blocs de texte que recouvre la plage `from`-`to`, changés en tabulations brutes (la transaction `tr` est modifiée). C'est ce qu'il faut avant
  // de poser un bloc de code : il n'admet que du texte, et changer le type d'un bloc efface ce qu'il n'admet pas. Le plugin remet ces tabulations en nœuds si le bloc
  // redevient un paragraphe.
  function tabsToText(tr, from, to) {
    const { schema } = tr.doc.type;
    const tabType = schema.nodes[NODE];
    if (!tabType) return tr;
    const found = [];
    tr.doc.nodesBetween(from, to, (block, blockPos) => {
      if (!block.isTextblock) return true;
      block.forEach((child, offset) => { if (child.type === tabType) found.push(blockPos + 1 + offset); });
      return false;
    });
    found.forEach(pos => tr.replaceWith(pos, pos + 1, schema.text(TAB)));
    return tr;
  }

  // Une sortie de zone à deux temps : Échap (que personne n'a pris) arme la sortie, le Tab ou Maj+Tab qui suit la laisse au navigateur. Tout autre geste la désarme.
  function createExitGate() {
    let armed = false;
    return {
      arm() { armed = true; },
      disarm() { armed = false; },
      // Vrai pour le Tab ou Maj+Tab qui doit sortir de la zone (et désarme) ; toute autre touche, hors les modificateurs seuls, désarme.
      passes(event) {
        if (['Shift', 'Control', 'Alt', 'Meta', 'Escape'].includes(event.key)) return false;
        const exits = armed && event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey;
        armed = false;
        return exits;
      },
    };
  }

  // L'écriture d'une tabulation au curseur ou sur la sélection, dans un état ProseMirror ; rend la transaction, ou null quand la touche n'a rien à faire ici.
  function indentTransaction(state, tabType) {
    const { selection, schema } = state;
    // Une sélection d'objet (image, bulle), de cases ou de tout le document ne se décale pas : la touche garde son effet d'avant.
    if (selection.node || selection.$anchorCell) return null;
    const { $from, $to } = selection;
    if (selection.empty) {
      if (!$from.parent.inlineContent || cellRole($from)) return null;
      const tr = state.tr;
      // Un texte qui n'admet pas le nœud (le code) garde une tabulation brute.
      if (!$from.parent.canReplaceWith($from.index(), $from.index(), tabType)) return tr.insertText(TAB);
      // La tabulation prend les marques du texte où elle tombe (gras, souligné...), celles choisies avant elle (gras activé sans rien taper) comprises.
      const base = state.storedMarks || $from.marks();
      tr.replaceSelectionWith(tabType.create(null, null, base), false);
      // Ce style choisi suit le texte qu'on tape ensuite.
      if (state.storedMarks) tr.setStoredMarks(base);
      return tr;
    }
    const blocks = textblocksIn(state.doc, $from.pos, $to.pos);
    if (!blocks.length) return null;
    const tr = state.tr;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const { node, pos } = blocks[i];
      tr.insert(pos + 1, node.canReplaceWith(0, 0, tabType) ? tabType.create() : schema.text(TAB));
    }
    return tr;
  }

  // Une tabulation, nœud ou caractère brut d'un bloc de code, qui commence `node` (un nœud trouvé à une position) ; sa taille est toujours 1.
  const startsWithTab = (node, tabType) => !!node && (node.type === tabType || (node.isText && node.text.startsWith(TAB)));
  const endsWithTab = (node, tabType) => !!node && (node.type === tabType || (node.isText && node.text.endsWith(TAB)));

  // Le retrait d'une tabulation : celle qui précède le curseur, à défaut celle qui ouvre sa ligne ; sur une sélection, celle qui ouvre chaque bloc. Rend la transaction
  // ou null quand la touche n'a rien à faire ici ; une transaction sans changement quand il n'y a rien à retirer (Maj+Tab ne sort pas de la zone).
  function outdentTransaction(state, tabType) {
    const { selection } = state;
    if (selection.node || selection.$anchorCell) return null;
    const { $from, $to } = selection;
    const tr = state.tr;
    if (selection.empty) {
      if (!$from.parent.inlineContent || cellRole($from)) return null;
      if (endsWithTab($from.nodeBefore, tabType)) return tr.delete($from.pos - 1, $from.pos);
      const head = lineStart($from);
      if (startsWithTab(state.doc.nodeAt(head), tabType)) tr.delete(head, head + 1);
      return tr;
    }
    const blocks = textblocksIn(state.doc, $from.pos, $to.pos);
    if (!blocks.length) return null;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const head = blocks[i].pos + 1;
      if (startsWithTab(state.doc.nodeAt(head), tabType)) tr.delete(head, head + 1);
    }
    return tr;
  }

  // L'extension TipTap : les touches Tab, Maj+Tab et Échap, et le plugin qui change en nœud les tabulations arrivées brutes et tient la sortie à deux temps. Priorité 1,
  // la plus basse : TipTap essaie les extensions de la plus haute priorité à la plus basse, et celles qui prennent déjà Tab (listes, colonnes, cases, listes ouvertes)
  // passent donc devant.
  function createExtension(Extension, { Plugin, PluginKey }) {
    return Extension.create({
      name: 'tabIndent',
      priority: 1,
      addKeyboardShortcuts() {
        const gate = this.storage.gate;
        const run = (editor, make) => {
          const tr = make(editor.state, editor.schema.nodes[NODE]);
          if (!tr) return false;
          if (tr.docChanged || tr.storedMarksSet) editor.view.dispatch(tr.scrollIntoView());
          return true;
        };
        return {
          Tab: ({ editor }) => run(editor, indentTransaction),
          'Shift-Tab': ({ editor }) => run(editor, outdentTransaction),
          // Le dernier à voir Échap : si personne ne l'a pris (aucune liste, aucune fenêtre à fermer), la sortie est armée.
          Escape: () => { gate.arm(); return false; },
        };
      },
      addStorage() { return { gate: createExitGate() }; },
      // « Bloc de code » (le bouton de js/main-toolbar.js, Ctrl+Alt+C) : la commande de TipTap, reprise telle quelle (basculer un paragraphe en bloc de code et retour),
      // précédée du changement des tabulations en texte. Priorité 1 : cette extension est la dernière, sa commande remplace celle de TipTap.
      addCommands() {
        return {
          toggleCodeBlock: attributes => ({ tr, commands }) => {
            tabsToText(tr, tr.selection.from, tr.selection.to);
            return commands.toggleNode('codeBlock', 'paragraph', attributes);
          },
        };
      },
      addProseMirrorPlugins() {
        const gate = this.storage.gate;
        return [new Plugin({
          key: new PluginKey('tabIndent'),
          appendTransaction: (transactions, _oldState, newState) => convertStrayTabs(transactions, newState),
          props: {
            handleDOMEvents: {
              // Avant tout le reste : le Tab d'une sortie armée n'est lu par aucune touche de l'éditeur (liste, case, colonne), sans que l'événement soit annulé -
              // le navigateur déplace le focus.
              keydown: (_view, event) => gate.passes(event),
              blur: () => { gate.disarm(); return false; },
              mousedown: () => { gate.disarm(); return false; },
            },
          },
        })];
      },
    });
  }

  // Un élément du HTML d'un modèle qui porte une tabulation : le <span class="pp-tab"> que le nœud écrit. Le seul test que les exports appliquent.
  function isTab(node) {
    return !!node && node.nodeType === 1 && node.classList.contains(CLASS);
  }

  return { NODE, CLASS, TAB, STOP_MM, STOP_TWIPS, STOP_PT, MARKDOWN_TAB, createNode, createExtension, isTab };
})();
