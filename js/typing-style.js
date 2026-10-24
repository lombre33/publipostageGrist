// Le style de frappe d'une case vide : la mise en forme de caractère choisie sur des cases sans texte (une sélection de cases, ou le curseur dans l'une d'elles) est gardée pour ce qui s'y
// écrira ensuite, comme dans Word. Gras, italique, souligné, barré, exposant, indice, police, taille, couleur de police et surlignage : sans lui, ProseMirror n'a rien à mettre en forme.
// Une marque ne se pose que sur du texte, une sélection de cases n'a pas de marque en attente, et celle d'un curseur disparaît au premier déplacement (Tab, clic ailleurs) : après un fond
// foncé et une police blanche, le texte tapé restait noir, le gras n'en laissait rien, et une bulle de variable posée ensuite n'était ni blanche ni grasse.
//
// Le style est un attribut du paragraphe d'une case (`<p data-typing-style='{"bold":true,"color":"#ffffff"}'></p>`, un attribut du paragraphe comme `data-keep-next`). Ni la Lecture, ni le
// PDF, ni le Word, ni les autres exports ne le lisent : ce qui se voit est la vraie mise en forme que le texte tapé (ou la bulle posée) porte ensuite, que tous les exports montrent déjà.
// Il ne vaut que pour une case de tableau ; ailleurs, et pour un document qui n'en a pas, rien ne change.
//
// Cinq gestes le servent :
//  - les commandes de marque de TipTap (`setMark`, `unsetMark`, `toggleMark`, reprises ici : le bouton Gras, Ctrl+B, les menus de police, de taille, de couleur et de surlignage les
//    passent toutes) l'écrivent dans la transaction même qui pose la marque, par `remember` : un seul Annuler défait les deux. Il va sur les paragraphes vides de case que la sélection
//    couvre, et suit les paragraphes de case qui en ont déjà un et qu'elle couvre en entier. Sous le suivi des modifications il n'est pas écrit : le suivi en ferait une modification
//    d'attribut du paragraphe, à accepter ou refuser, pour un réglage que personne ne lit ;
//  - une sélection de cases vides que le style couvre déjà s'éteint au second clic (`toggleMark` lit le style : sans texte, TipTap croit la marque éteinte) et la barre d'outils la montre
//    enfoncée (`commonStyle`) ;
//  - le curseur dans un paragraphe vide qui porte un style prépare la frappe, dans les marques en attente de ProseMirror (comme js/slides-entry.js pour la taille d'une diapositive) :
//    la frappe, l'Entrée et le menu des couleurs la prennent. Une marque déjà en attente n'est jamais remplacée ;
//  - un texte tapé sur une sélection de cases, que ProseMirror écrit dans la première (les autres sont vidées), prend le style de cette première case ;
//  - une bulle ou une puce posée dans un paragraphe qui porte un style en prend la mise en forme : ProseMirror ne donne pas les marques en attente à ce qu'on insère, seulement au texte
//    tapé (le « # » qui ouvre la liste des variables est colorié, la bulle qui le remplace ne l'était pas).
// Le style n'est jamais retiré en cours de frappe : changer le paragraphe sous les doigts gênerait une composition (accent mort).
const TypingStyle = (function () {
  const ATTR = 'data-typing-style';
  // Les marques de caractère qui s'allument et s'éteignent (une valeur `true`), et celle qu'un exposant ou un indice exclut : un caractère n'est jamais les deux.
  const FLAGS = ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript'];
  const OPPOSITE = { superscript: 'subscript', subscript: 'superscript' };
  // Les réglages de la marque `textStyle` (js/editor-nodes.js), et ce que leur valeur a le droit d'être : le style est relu d'un HTML qu'une autre personne a pu écrire, et le texte
  // tapé en reçoit un `style="…"`.
  const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|[a-z]{3,24})$/i;
  const SETTINGS = {
    color: COLOR,
    backgroundColor: COLOR,
    fontSize: /^\d{1,3}(?:\.\d{1,3})?(?:px|pt|em|rem|%)$/i,
    fontFamily: /^[\p{L}\p{N}\s,'"_-]{1,120}$/u,
    letterSpacing: /^-?\d{1,3}(?:\.\d{1,2})?pt$/,
    fontVariant: /^small-caps$/,
  };

  // Le style en attente lu d'un objet ou de son texte JSON : seuls les réglages connus, aux valeurs sûres, dans un ordre fixe ; null quand il n'en reste aucun.
  function normalize(raw) {
    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); } catch (e) { return null; }
    }
    if (!data || typeof data !== 'object') return null;
    const style = {};
    FLAGS.forEach((key) => { if (data[key] === true && !(OPPOSITE[key] && style[OPPOSITE[key]])) style[key] = true; });
    Object.keys(SETTINGS).forEach((key) => {
      const value = typeof data[key] === 'string' ? data[key].trim() : '';
      if (value && SETTINGS[key].test(value)) style[key] = value;
    });
    return Object.keys(style).length ? style : null;
  }
  const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
  // Le style `current` avec les réglages de `change` (une marque `true` ou `false`, un réglage de texte à sa valeur ou à null : un exposant pris retire l'indice, une valeur nulle retire
  // le réglage).
  function merged(current, change) {
    const style = Object.assign({}, current);
    FLAGS.forEach((key) => {
      if (!(key in change)) return;
      if (change[key]) {
        style[key] = true;
        if (OPPOSITE[key]) delete style[OPPOSITE[key]];
      } else delete style[key];
    });
    Object.keys(SETTINGS).forEach((key) => {
      if (!(key in change)) return;
      if (change[key]) style[key] = change[key]; else delete style[key];
    });
    return normalize(style);
  }

  // Les marques `marks` complétées par le style : ses marques de caractère qui n'y sont pas, et ses réglages de texte dans la marque `textStyle`, sans jamais remplacer une valeur déjà
  // là ; null quand il n'y a rien à ajouter.
  function withStyle(schema, style, marks) {
    if (!style) return null;
    let result = marks;
    let changed = false;
    FLAGS.forEach((key) => {
      const type = schema.marks[key];
      if (!style[key] || !type || result.some(mark => mark.type === type || mark.type.name === OPPOSITE[key])) return;
      result = type.create().addToSet(result);
      changed = true;
    });
    const textStyle = schema.marks.textStyle;
    if (textStyle) {
      const current = result.find(mark => mark.type === textStyle);
      const attrs = Object.assign({}, current ? current.attrs : {});
      let blank = false;
      Object.keys(SETTINGS).forEach((key) => {
        if (style[key] && attrs[key] == null) { attrs[key] = style[key]; blank = true; }
      });
      if (blank) {
        result = textStyle.create(attrs).addToSet(current ? current.removeFromSet(result) : result);
        changed = true;
      }
    }
    return changed ? result : null;
  }

  const isCell = node => node.type.name === 'tableCell' || node.type.name === 'tableHeader';
  // Un paragraphe posé directement dans une case (ni légende, ni élément de liste ou de colonne dans la case).
  const isCellParagraph = (node, parent) => node.type.name === 'paragraph' && !node.attrs.caption && isCell(parent);
  // Les atomes en ligne qui se lisent comme du texte, et prennent donc la mise en forme du style de leur paragraphe.
  const VALUE_ATOMS = ['varBadge', 'calcBadge', 'smartChip', 'mention', 'pageNumberBadge'];

  // Les positions des paragraphes de case dont le style de frappe suit la sélection : les vides qu'elle couvre (le curseur dans l'un d'eux, ou une sélection de cases), et ceux qui
  // en ont déjà un et qu'elle couvre en entier (changer la mise en forme d'une case change aussi celle de ce qu'on y écrira).
  function seedableParagraphs(selection) {
    const found = [];
    const { doc } = selection.$from;
    selection.ranges.forEach((range) => {
      const from = range.$from.pos;
      const to = range.$to.pos;
      doc.nodesBetween(from, to, (node, pos, parent) => {
        if (node.type.name !== 'paragraph') return true;
        const whole = from <= pos + 1 && to >= pos + node.nodeSize - 1;
        if (isCellParagraph(node, parent) && (!node.content.size || (node.attrs.typingStyle && whole))) found.push(pos);
        return false;
      });
    });
    return found;
  }

  // Ce que la barre d'outils lit d'une sélection de cases qui ne couvre aucun texte : le style que tous leurs paragraphes vides ont en commun (un objet, vide quand ils diffèrent) ;
  // null pour toute autre sélection (un curseur, du texte, une bulle, une liste : la barre lit alors le contenu, comme TipTap).
  function commonStyle(selection) {
    if (typeof selection.forEachCell !== 'function') return null;
    const { doc } = selection.$from;
    const styles = [];
    let content = false;
    selection.ranges.forEach((range) => {
      doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos, parent) => {
        if (content) return false;
        if (isCell(node) || ['table', 'tableRow'].includes(node.type.name)) return true;
        if (isCellParagraph(node, parent) && !node.content.size) styles.push(node.attrs.typingStyle || {});
        else content = true;
        return false;
      });
    });
    if (content || !styles.length) return null;
    const shared = {};
    Object.keys(styles[0]).forEach((key) => { if (styles.every(style => style[key] === styles[0][key])) shared[key] = styles[0][key]; });
    return shared;
  }

  // Les marques que le curseur doit prendre : celles du style du paragraphe vide où il est, complétant `stored` (les marques en attente, ou celles du curseur) ; null sinon.
  function pendingMarks(schema, selection, stored) {
    const cursor = selection.$cursor;
    if (!cursor) return null;
    const node = cursor.parent;
    if (node.content.size || !node.attrs.typingStyle || !isCellParagraph(node, cursor.node(cursor.depth - 1))) return null;
    return withStyle(schema, node.attrs.typingStyle, stored || cursor.marks());
  }

  // Dans la transaction `tr` d'une commande de marque : le réglage `change` ({ bold: true } le pose, { color: null } le retire) va au style de frappe de chaque paragraphe vide de case
  // que la sélection couvre. Les marques en attente du curseur sont gardées : écrire dans le paragraphe les efface.
  function remember(tr, change) {
    if (Editor.isTrackChangesOn()) return true;
    const stored = tr.storedMarks;
    let written = false;
    seedableParagraphs(tr.selection).forEach((pos) => {
      const current = tr.doc.nodeAt(pos).attrs.typingStyle;
      const next = merged(current, change);
      if (same(next, current)) return;
      tr.setNodeAttribute(pos, 'typingStyle', next);
      written = true;
    });
    if (written && stored) tr.setStoredMarks(stored);
    return true;
  }

  // Ce qu'une commande de marque change du style : `on` dit si elle pose (true) ou retire (false). Une marque qui n'est pas de la mise en forme de caractère (lien, commentaire) : null.
  function changeOf(name, attributes, on) {
    if (FLAGS.includes(name)) return { [name]: on };
    if (name !== 'textStyle') return null;
    const change = {};
    Object.keys(SETTINGS).forEach((key) => {
      if (on && attributes && key in attributes) change[key] = attributes[key];
      else if (!on) change[key] = null;
    });
    return change;
  }
  const nameOf = typeOrName => (typeof typeOrName === 'string' ? typeOrName : typeOrName.name);

  // Les intervalles du document final où `trs` ont posé du contenu en ligne seul (une bulle, une puce, du texte) : un pas qui remplace un intervalle par des nœuds en ligne, ses
  // bords fermés. Ni un document chargé, ni un collage de blocs, ni une annulation n'en sont.
  function insertedRanges(trs) {
    const steps = [];
    const maps = [];
    trs.forEach(tr => tr.steps.forEach((step, i) => { steps.push(step); maps.push(tr.mapping.maps[i]); }));
    const ranges = [];
    steps.forEach((step, index) => {
      const { slice } = step;
      if (!slice || 'gapFrom' in step || slice.openStart || slice.openEnd || !slice.size) return;
      let inline = true;
      slice.content.forEach((child) => { if (!child.isInline) inline = false; });
      if (!inline) return;
      let start = step.from;
      let end = step.from + slice.size;
      for (let k = index + 1; k < maps.length; k++) { start = maps[k].map(start, -1); end = maps[k].map(end, 1); }
      ranges.push([start, end]);
    });
    return ranges;
  }

  // La transaction qui donne leur mise en forme aux bulles et aux puces que `trs` ont posées dans un paragraphe de case qui porte un style de frappe, ou null.
  function styleInserted(trs, state) {
    if (trs.some(tr => tr.getMeta('history$') || LiveEntry.isRemote(tr))) return null;
    const { doc, schema } = state;
    let result = null;
    insertedRanges(trs).forEach(([from, to]) => {
      doc.nodesBetween(Math.max(from, 0), Math.min(to, doc.content.size), (node, pos, parent) => {
        if (!node.isInline) return true;
        if (!VALUE_ATOMS.includes(node.type.name) || !parent.attrs.typingStyle) return false;
        const $pos = doc.resolve(pos);
        if (!isCellParagraph(parent, $pos.node($pos.depth - 1))) return false;
        const marks = withStyle(schema, parent.attrs.typingStyle, node.marks);
        if (marks) {
          result = result || state.tr;
          marks.forEach((mark) => { if (!mark.isInSet(node.marks)) result.addMark(pos, pos + node.nodeSize, mark); });
        }
        return false;
      });
    });
    return result;
  }

  // `commands` : les commandes d'origine de `@tiptap/core`, que les trois commandes de marque ci-dessous appellent avant d'écrire le style. Sans elles (une version de TipTap qui ne les
  // exporte plus), les commandes de TipTap restent telles quelles : le style n'est alors plus écrit, mais le gras et les autres marques marchent comme avant.
  function createExtension(Extension, { Plugin, PluginKey, commands }) {
    return Extension.create({
      name: 'typingStyle',
      addGlobalAttributes() {
        return [{
          types: ['paragraph'],
          attributes: {
            typingStyle: {
              default: null,
              // Entrée ouvre un paragraphe sans style : les marques en attente du curseur suivent déjà.
              keepOnSplit: false,
              parseHTML: el => normalize(el.getAttribute(ATTR)),
              renderHTML: attrs => (attrs.typingStyle ? { [ATTR]: JSON.stringify(attrs.typingStyle) } : {}),
            },
          },
        }];
      },
      addCommands() {
        if (!commands) return {};
        return {
          setMark: (typeOrName, attributes = {}) => (props) => {
            const done = commands.setMark(typeOrName, attributes)(props);
            const change = props.dispatch && changeOf(nameOf(typeOrName), attributes, true);
            if (change) remember(props.tr, change);
            return done;
          },
          unsetMark: (typeOrName, options = {}) => (props) => {
            const done = commands.unsetMark(typeOrName, options)(props);
            const change = props.dispatch && changeOf(nameOf(typeOrName), null, false);
            if (change) remember(props.tr, change);
            return done;
          },
          // Des cases vides déjà en gras : TipTap, sans texte à lire, croit la marque éteinte et la reposerait à chaque clic.
          toggleMark: (typeOrName, attributes = {}, options = {}) => (props) => {
            const name = nameOf(typeOrName);
            const shared = props.dispatch && FLAGS.includes(name) ? commonStyle(props.tr.selection) : null;
            if (shared && shared[name]) return props.commands.unsetMark(typeOrName, options);
            return commands.toggleMark(typeOrName, attributes, options)(props);
          },
        };
      },
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey('typingStyle'),
          appendTransaction(trs, oldState, state) {
            // Les bulles posées d'abord : écrire dans le document efface les marques en attente, qu'on rend ensuite au curseur.
            const styled = styleInserted(trs, state);
            const marks = pendingMarks(state.schema, styled ? styled.selection : state.selection, state.storedMarks);
            if (!marks) return styled;
            return (styled || state.tr).setStoredMarks(marks);
          },
          props: {
            // Un texte tapé sur une sélection de cases va dans la première : il y prend le style de son paragraphe vide.
            handleTextInput(view, from, to, text) {
              const { state } = view;
              const { selection } = state;
              if (typeof selection.forEachCell !== 'function') return false;
              const first = selection.ranges[0].$from.nodeAfter;
              const marks = first && first.type.name === 'paragraph' && !first.content.size ? withStyle(state.schema, first.attrs.typingStyle, []) : null;
              if (!marks) return false;
              view.dispatch(state.tr.replaceSelectionWith(state.schema.text(text, marks), false).scrollIntoView());
              return true;
            },
          },
        })];
      },
    });
  }

  return { ATTR, remember, commonStyle, createExtension, normalize };
})();
