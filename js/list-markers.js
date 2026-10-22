// Les ronds, les tirets et les numéros d'une liste suivent leur ligne : même couleur et même taille que le début de leur texte, comme dans PowerPoint, Word et Google Docs (choix du porteur, 22/10,
// « Dans tous les modèles »). Avant, la puce gardait la couleur et la taille du point de liste lui-même, alors que le réglage du texte est posé sur des <span> dedans : du texte blanc de 28 pt sur un
// fond foncé gardait un rond noir de 10,5 pt, presque invisible.
//
// Le réglage qui compte est celui du premier texte du point : la marque `textStyle` (js/editor-nodes.js) de son premier caractère, ou de sa première bulle - sa couleur et sa taille, rien d'autre. Ni le
// gras, ni la police, ni la couleur d'un lien ne passent à la puce. Sans couleur ni taille posées sur ce texte, rien ne change : la puce garde celles du point (le noir du document, ou la couleur et la
// taille que le point reçoit d'ailleurs). Une liste à cases n'a pas de puce : elle n'est pas concernée.
//
// Deux variables CSS, posées sur le <li> : `--pp-marker-color` et `--pp-marker-size`, que `li::marker` lit (css/editor-v2.css) - un `::marker` n'accepte que la couleur, les polices et son contenu, il
// ne se règle pas depuis le texte d'à côté. Trois chemins, un même réglage :
//  - l'éditeur : une décoration de nœud sur chaque point (createExtension), calculée sur le document ProseMirror. Elle n'est qu'à l'écran : rien n'en reste dans le document, le HTML enregistré ni le
//    presse-papiers. Les miniatures des diapositives copient le rendu de l'éditeur et la gardent ;
//  - la Lecture, l'impression et le diaporama : `apply` pose les mêmes variables sur le HTML résolu (js/reader-mode.js:resolveReaderBody), où le texte d'une bulle est déjà sa valeur ;
//  - les exports (PDF, Word, PowerPoint, HTML) : lisent `styleOfElement` sur le HTML qu'ils exportent, ou les variables que `apply` a posées, et écrivent la puce de la même couleur et de la même taille.
const ListMarkers = (function () {
  const COLOR_VAR = '--pp-marker-color';
  const SIZE_VAR = '--pp-marker-size';
  // Ce que le réglage a le droit d'être : celui de js/typing-style.js (SETTINGS), le HTML d'une autre personne pouvant porter n'importe quoi dans `style="…"`, et la valeur passe dans une variable.
  const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|[a-z]{3,24})$/i;
  const SIZE = /^\d{1,3}(?:\.\d{1,3})?(?:px|pt|em|rem|%)$/i;
  // Les mots qui ne sont pas une couleur : ils laisseraient la puce à la couleur du point, ce que dit déjà l'absence de réglage.
  const NOT_A_COLOR = /^(?:inherit|initial|unset|revert|revert-layer|currentcolor)$/i;
  // Les morceaux d'un paragraphe qui ne sont pas du texte : la puce ne les suit pas, elle prend le premier texte après eux.
  const NOT_TEXT = new Set(['editorImage', 'hardBreak', 'tabStop']);

  const colorOf = value => { const text = typeof value === 'string' ? value.trim() : ''; return text && COLOR.test(text) && !NOT_A_COLOR.test(text) ? text : null; };
  const sizeOf = value => { const text = typeof value === 'string' ? value.trim() : ''; return text && SIZE.test(text) ? text : null; };
  // `{ color, size }` (l'un ou l'autre peut manquer) ou null quand il n'y a aucun réglage.
  function styleFrom(color, size) {
    const style = { color: colorOf(color), size: sizeOf(size) };
    return style.color || style.size ? style : null;
  }
  // Le texte de la déclaration qui pose ce réglage sur un <li>.
  function cssText(style) {
    return [style.color && COLOR_VAR + ': ' + style.color, style.size && SIZE_VAR + ': ' + style.size].filter(Boolean).join('; ');
  }

  // --- Le document ProseMirror -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Le réglage d'une suite de marques : celui de leur `textStyle`.
  function styleOfMarks(marks) {
    const mark = (marks || []).find(candidate => candidate.type.name === 'textStyle');
    return mark ? styleFrom(mark.attrs.color, mark.attrs.fontSize) : null;
  }
  // Le réglage d'un point de liste (un nœud `listItem`) : celui du premier morceau de texte de son premier paragraphe - un espace seul ne compte pas, une image, un retour à la ligne et une tabulation non plus.
  function styleOfNode(item) {
    const paragraph = item.firstChild;
    if (!paragraph || !paragraph.isTextblock) return null;
    let first = null;
    paragraph.forEach((child) => {
      if (!first && !NOT_TEXT.has(child.type.name) && !(child.isText && !/\S/.test(child.text))) first = child;
    });
    return first ? styleOfMarks(first.marks) : null;
  }

  // `libs` : les classes de ProseMirror que js/editor.js a déjà chargées ({ Plugin, PluginKey, Decoration, DecorationSet }).
  function createExtension(Extension, libs) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = libs;
    const key = new PluginKey('listMarkers');
    // Un nœud ne change jamais : le réglage d'un point qui n'a pas bougé se relit ici, pas dans ses marques.
    const known = new WeakMap();
    const styleOfKnown = (item) => {
      if (!known.has(item)) known.set(item, styleOfNode(item));
      return known.get(item);
    };
    const decorate = (item, pos, style) => Decoration.node(pos, pos + item.nodeSize, { style: cssText(style) });
    function decorationsOf(doc) {
      const found = [];
      doc.descendants((node, pos) => {
        if (node.isTextblock) return false;   // le texte n'a pas de liste dedans : inutile d'y descendre
        if (node.type.name !== 'listItem') return true;
        const style = styleOfKnown(node);
        if (style) found.push(decorate(node, pos, style));
        return true;
      });
      return found.length ? DecorationSet.create(doc, found) : DecorationSet.empty;
    }
    // Le point encore vide où se trouve le curseur : sa puce prend déjà ce que la prochaine frappe portera (la couleur choisie sur une ligne vide, ou gardée par Entrée après une ligne colorée), pas au premier caractère.
    function pendingDecoration(state) {
      const { selection, storedMarks } = state;
      if (!selection.empty || !storedMarks || !storedMarks.length) return null;
      const { $from } = selection;
      const item = $from.depth >= 2 ? $from.node($from.depth - 1) : null;
      if (!item || item.type.name !== 'listItem' || item.firstChild !== $from.parent || $from.parent.content.size) return null;
      const style = styleOfMarks(storedMarks);
      return style ? decorate(item, $from.before($from.depth - 1), style) : null;
    }
    return Extension.create({
      name: 'listMarkers',
      addProseMirrorPlugins() {
        return [new Plugin({
          key,
          state: {
            init: (config, state) => decorationsOf(state.doc),
            apply: (tr, set, oldState, newState) => (tr.docChanged ? decorationsOf(newState.doc) : set),
          },
          props: {
            decorations(state) {
              const set = key.getState(state);
              const pending = pendingDecoration(state);
              return pending ? set.add(state.doc, [pending]) : set;
            },
          },
        })];
      },
    });
  }

  // --- Le HTML -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Le premier texte (autre qu'un blanc) d'un <li>, hors de ses sous-listes ; null quand le point n'a aucun texte à lui.
  function firstTextOf(li) {
    const list = li.parentElement;
    const walker = li.ownerDocument.createTreeWalker(li, NodeFilter.SHOW_TEXT, {
      acceptNode: node => (/\S/.test(node.nodeValue) && node.parentElement && node.parentElement.closest('ul, ol') === list ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    return walker.nextNode();
  }
  // Le réglage d'un <li> du HTML : la couleur et la taille posées en ligne (`style="…"`) sur le premier texte ou sur ce qui l'enveloppe, jusqu'au <li> compris, la plus proche l'emportant, comme le fait
  // le navigateur. Sans lire de style calculé : le HTML peut ne pas être dans la page (un export). null quand il n'y en a aucun, ou pour un point de liste à cases.
  function styleOfElement(li) {
    const list = li.parentElement;
    if (!list || list.getAttribute('data-type') === 'taskList') return null;
    const text = firstTextOf(li);
    if (!text) return null;
    let color = '';
    let size = '';
    for (let element = text.parentElement; element; element = element.parentElement) {
      if (!color && element.style) color = element.style.color;
      if (!size && element.style) size = element.style.fontSize;
      if (element === li) break;
    }
    return styleFrom(color, size);
  }
  // Pose les variables sur chaque <li> de `root` qui a un réglage ; rend leur nombre.
  function apply(root) {
    let count = 0;
    root.querySelectorAll('li').forEach((li) => {
      const style = styleOfElement(li);
      if (!style) return;
      if (style.color) li.style.setProperty(COLOR_VAR, style.color);
      if (style.size) li.style.setProperty(SIZE_VAR, style.size);
      count += 1;
    });
    return count;
  }

  return { COLOR_VAR, SIZE_VAR, styleOfMarks, styleOfNode, styleOfElement, cssText, apply, createExtension };
})();
