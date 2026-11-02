// Le style d'un niveau de titre (« Titre 1 » à « Titre 6 »), pris d'après la sélection, comme « Mettre à jour Titre 2 pour correspondre à la sélection » de Word (demande du 22/10, lancée le 02/11).
// Un titre n'a d'ordinaire que la taille et le poids de sa balise (js/export-common.js:EDITOR_STYLE.headingPt, gras) : la police, la couleur ou l'alignement qu'on lui donne est réglée à la main, titre par titre.
// Ici la personne met en forme UN titre, place le curseur dedans (ou y sélectionne du texte) et choisit « Mettre à jour « Titre N » d'après la sélection » dans le menu Titre : tous les titres de ce niveau, ceux du
// document et ceux qu'elle écrira, prennent la même mise en forme. « Rétablir le style d'origine » la retire.
//
// Ce que le style garde : la police, la taille, la couleur, le surlignage, l'italique, le souligné, le barré, l'espacement des caractères, les petites capitales, l'ombre et le contour des lettres (les réglages du
// style de frappe, js/typing-style.js, sauf le gras, l'exposant et l'indice), et l'alignement. Pas le gras : un titre est toujours gras. Pas l'interligne ni les espaces avant et après : ils ne se règlent que sur un paragraphe.
// Un réglage qui varie dans la sélection (deux couleurs) laisse celui du style tel qu'il est.
//
// Le style est gardé DANS LE MODÈLE, sur le nœud caché de la numérotation des titres (js/editor-nodes.js:createHeadingNumberingConfigNode, `div.heading-numbering-config`) : `data-level-styles='{"1":{"color":"#1f4e79",
// "fontSize":"20pt"}}'`. Un modèle porte donc son style de titres avec lui (copie, « Enregistrer sous… », galerie), sans colonne ni clé de plus. Il n'est PAS une feuille de style globale : celle-ci fausserait un macro-modèle
// et l'export d'un autre modèle que celui de l'écran. Trois chemins, une même mise en forme :
//  - l'éditeur : une décoration de nœud sur chaque titre du niveau (createExtension), comme js/list-markers.js. Elle n'est qu'à l'écran : rien n'en reste dans le HTML d'un titre. Le `text-align` du titre l'emporte sur
//    celui du style, une marque de texte (une couleur posée sur un mot) sur celle du titre ;
//  - la Lecture, l'impression, le diaporama et tous les exports : `apply` pose le même `style="…"` sur les <h1> à <h6> du HTML résolu (js/reader-mode.js:resolveReaderBody et ReaderMode.preview), que le PDF, le Word, le
//    HTML et le PowerPoint lisent déjà sur n'importe quel élément (inheritedStyle, inheritedRunStyle, keptStyle, styles calculés). Le numéro d'un titre numéroté suit la mise en forme de son titre ;
//  - le surlignage seul passe par un <span> autour du texte du titre (une décoration en ligne dans l'éditeur) : sur le titre, il peindrait toute la ligne à l'écran et le seul texte dans le PDF et le Word.
//
// « Mettre à jour » écrit le style et retire, des titres du niveau, la mise en forme à la main des réglages que le style porte (sinon la couleur posée sur un titre garderait ce titre hors du style, aujourd'hui et à la
// prochaine mise à jour), en une seule transaction : un Ctrl+Z défait les deux. Le suivi des modifications n'en fait pas des suggestions (un réglage de modèle, pas une rédaction). Les liens, les commentaires, le gras,
// l'exposant, l'indice et le reste ne sont pas touchés.
const HeadingStyles = (function () {
  const ATTR = 'data-level-styles';
  const LEVELS = [1, 2, 3, 4, 5, 6];
  // Les marques à deux états que le style garde (les autres, gras, exposant et indice, ne sont pas du style d'un titre).
  const FLAGS = ['italic', 'underline', 'strike'];
  const ALIGNS = ['left', 'center', 'right', 'justify'];
  // Le réglage de texte de la marque `textStyle` -> la déclaration CSS qui l'écrit (la même que celle de la marque, js/editor-nodes.js et js/character-format.js). Le surlignage est à part : voir `fillOf`.
  const CSS = {
    fontFamily: 'font-family', fontSize: 'font-size', color: 'color', letterSpacing: 'letter-spacing', fontVariant: 'font-variant', textShadow: 'text-shadow', textStroke: '-webkit-text-stroke',
  };
  // Les bulles et puces qui se lisent comme du texte : leur mise en forme compte dans celle d'une sélection.
  const VALUE_ATOMS = new Set(['varBadge', 'calcBadge', 'smartChip', 'mention', 'pageNumberBadge']);

  // Un style de niveau lu d'un objet : seuls les réglages connus aux valeurs sûres (ceux de js/typing-style.js), l'alignement, dans un ordre fixe ; null quand il n'en reste aucun.
  function cleanStyle(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const picked = {};
    FLAGS.forEach((key) => { if (raw[key] === true) picked[key] = true; });
    TypingStyle.SETTING_KEYS.forEach((key) => { if (raw[key]) picked[key] = raw[key]; });
    const style = TypingStyle.normalize(picked) || {};
    if (ALIGNS.includes(raw.textAlign)) style.textAlign = raw.textAlign;
    return Object.keys(style).length ? style : null;
  }

  // Les styles de niveau lus d'un objet ou de son texte JSON ({ "1": style, … "6": style }) : un niveau sans réglage est absent ; null quand il n'en reste aucun.
  function normalize(raw) {
    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); } catch (e) { return null; }
    }
    if (!data || typeof data !== 'object') return null;
    const styles = {};
    LEVELS.forEach((level) => {
      const style = cleanStyle(data[level]);
      if (style) styles[level] = style;
    });
    return Object.keys(styles).length ? styles : null;
  }
  const serialize = styles => (styles && Object.keys(styles).length ? JSON.stringify(styles) : '');

  // Les déclarations CSS d'un style, hors surlignage et alignement. `align` : vrai pour y ajouter le `text-align` du style.
  function declarations(style, align) {
    const found = [];
    Object.keys(CSS).forEach((key) => { if (style[key]) found.push(CSS[key] + ': ' + style[key]); });
    if (style.italic) found.push('font-style: italic');
    const lines = [style.underline && 'underline', style.strike && 'line-through'].filter(Boolean);
    if (lines.length) found.push('text-decoration: ' + lines.join(' '));
    if (align && style.textAlign) found.push('text-align: ' + style.textAlign);
    return found;
  }
  const fillOf = style => (style && style.backgroundColor ? 'background-color: ' + style.backgroundColor : '');

  // Le nœud de configuration des titres du document (le dernier, comme js/editor.js:getHeadingNumberingStyle) : { node, pos }, ou null.
  function configOf(doc) {
    let found = null;
    doc.forEach((node, pos) => { if (node.type.name === 'headingNumberingConfig') found = { node, pos }; });
    return found;
  }
  const stylesOf = doc => { const config = configOf(doc); return (config && config.node.attrs.levelStyles) || null; };

  // --- Le HTML résolu (Lecture, impression, diaporama, exports) ---

  // Pose sur chaque <h1> à <h6> de `root` le style de son niveau, d'après le nœud de configuration que `root` porte à sa racine ; rend le nombre de titres mis en forme. Un réglage que le titre porte déjà en ligne
  // (son `text-align`) n'est pas remplacé.
  function apply(root) {
    const config = root.querySelector(':scope > .heading-numbering-config');
    const styles = config ? normalize(config.getAttribute(ATTR)) : null;
    if (!styles) return 0;
    let count = 0;
    root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
      const style = styles[heading.tagName.slice(1)];
      if (!style) return;
      const written = heading.style;
      const added = declarations(style, !written.textAlign).filter(text => !written.getPropertyValue(text.slice(0, text.indexOf(':'))));
      if (added.length) heading.setAttribute('style', (heading.getAttribute('style') ? heading.getAttribute('style').replace(/;?\s*$/, '; ') : '') + added.join('; '));
      if (style.backgroundColor && heading.firstChild) {
        const fill = heading.ownerDocument.createElement('span');
        fill.setAttribute('style', fillOf(style));
        while (heading.firstChild) fill.appendChild(heading.firstChild);
        heading.appendChild(fill);
      }
      count += 1;
    });
    return count;
  }

  // --- L'éditeur ---

  // `libs` : les classes de ProseMirror que js/editor.js a déjà chargées ({ Plugin, PluginKey, Decoration, DecorationSet }).
  function createExtension(Extension, libs) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = libs;
    const key = new PluginKey('headingStyles');
    function decorationsOf(doc) {
      const styles = stylesOf(doc);
      if (!styles) return DecorationSet.empty;
      const found = [];
      doc.descendants((node, pos) => {
        if (node.type.name !== 'heading') return !node.isTextblock;
        const style = styles[node.attrs.level];
        if (!style) return false;
        // L'alignement posé sur le titre l'emporte : la décoration s'ajoute à son `style`, après lui.
        const own = declarations(style, !node.attrs.textAlign);
        if (own.length) found.push(Decoration.node(pos, pos + node.nodeSize, { style: own.join('; ') }));
        if (style.backgroundColor && node.content.size) found.push(Decoration.inline(pos + 1, pos + node.nodeSize - 1, { style: fillOf(style) }));
        return false;
      });
      return found.length ? DecorationSet.create(doc, found) : DecorationSet.empty;
    }
    return Extension.create({
      name: 'headingStyles',
      addProseMirrorPlugins() {
        return [new Plugin({
          key,
          state: {
            init: (config, state) => decorationsOf(state.doc),
            apply: (tr, set, oldState, newState) => (tr.docChanged ? decorationsOf(newState.doc) : set),
          },
          props: { decorations: state => key.getState(state) },
        })];
      },
    });
  }

  // --- La sélection ---

  // Le titre que la sélection vise : son curseur ou son texte est dans UN titre du texte. `locked` : la clé de la raison du grisage, sinon { heading, level }.
  function target(state) {
    if (HeaderFooterPreview.getHfMode() || GridEditor.isActive()) return { locked: 'headingStyle.notHere' };
    const { $from, $to } = state.selection;
    const heading = $from.parent;
    if (!$from.sameParent($to) || heading.type.name !== 'heading') return { locked: 'headingStyle.notHere' };
    return { heading, level: heading.attrs.level };
  }

  // Le style que des marques donnent au texte : les réglages de ce module seulement, ni le gras, ni l'exposant, ni l'indice, ni un lien.
  function styleOfMarks(marks) {
    const raw = {};
    (marks || []).forEach((mark) => {
      const name = mark.type.name;
      if (FLAGS.includes(name)) raw[name] = true;
      else if (name === 'textStyle') TypingStyle.SETTING_KEYS.forEach((setting) => { if (mark.attrs[setting]) raw[setting] = mark.attrs[setting]; });
    });
    return cleanStyle(raw) || {};
  }

  // Le style que la sélection donnerait au niveau de son titre : celui qu'il a déjà, avec chaque réglage que TOUT le texte de la sélection a en commun (un réglage qui varie ne change rien), et l'alignement du titre
  // quand il en a un. `set` : ceux de ces réglages que la sélection pose elle-même (une marque sur son texte, l'alignement du titre) - la mise en forme à la main de ceux-là, sur les autres titres du niveau, est ce que
  // « Mettre à jour » retire ; un réglage que le style avait déjà et que la sélection ne porte pas n'est pas touché. null quand il n'y a rien à garder.
  function captureStyle(state, heading, base) {
    const { selection, doc } = state;
    const samples = [];
    if (selection.empty) samples.push(state.storedMarks || selection.$from.marks());
    else {
      doc.nodesBetween(selection.from, selection.to, (node) => {
        if (node.isText || VALUE_ATOMS.has(node.type.name)) samples.push(node.marks);
      });
    }
    if (!samples.length) samples.push([]);
    const own = samples.map(marks => styleOfMarks(marks));
    const each = own.map(style => Object.assign({}, base, style));
    const result = Object.assign({}, base);
    const set = {};
    new Set(each.reduce((all, style) => all.concat(Object.keys(style)), [])).forEach((setting) => {
      if (!each.every(style => style[setting] === each[0][setting]) || each[0][setting] === undefined) return;
      result[setting] = each[0][setting];
      if (own.some(style => style[setting] !== undefined)) set[setting] = each[0][setting];
    });
    if (heading.attrs.textAlign) { result.textAlign = heading.attrs.textAlign; set.textAlign = heading.attrs.textAlign; }
    const style = cleanStyle(result);
    return style ? { style, set: cleanStyle(set) || {} } : null;
  }

  // Dans la transaction `tr`, retire des titres de `level` de `doc` la mise en forme à la main des réglages que `style` porte : leur marque, leur réglage de la marque `textStyle`, leur alignement. Les positions sont
  // celles de `doc` : une marque ne déplace rien.
  function stripDirect(tr, doc, level, style) {
    const { schema } = doc.type;
    const textStyle = schema.marks.textStyle;
    const settings = TypingStyle.SETTING_KEYS.filter(key => style[key]);
    doc.descendants((node, pos) => {
      if (node.type.name !== 'heading') return !node.isTextblock;
      if (node.attrs.level !== level) return false;
      const from = pos + 1;
      const to = pos + node.nodeSize - 1;
      if (style.textAlign && node.attrs.textAlign) tr.setNodeAttribute(pos, 'textAlign', null);
      FLAGS.forEach((flag) => { if (style[flag] && schema.marks[flag]) tr.removeMark(from, to, schema.marks[flag]); });
      if (!textStyle || !settings.length) return false;
      node.forEach((child, offset) => {
        child.marks.forEach((mark) => {
          if (mark.type !== textStyle) return;
          const attrs = Object.assign({}, mark.attrs);
          let changed = false;
          settings.forEach((setting) => { if (attrs[setting] != null) { attrs[setting] = null; changed = true; } });
          if (!changed) return;
          const start = from + offset;
          tr.removeMark(start, start + child.nodeSize, mark);
          if (Object.keys(attrs).some(name => attrs[name] != null)) tr.addMark(start, start + child.nodeSize, textStyle.create(attrs));
        });
      });
      return false;
    });
  }

  // Dans la transaction `tr`, écrit `styles` sur le nœud de configuration des titres (créé en tête quand le document n'en a pas encore).
  // Sans changement (les mêmes styles), rien n'est écrit : un pas de plus ferait un Ctrl+Z qui ne défait rien.
  function writeStyles(tr, state, styles) {
    const config = configOf(state.doc);
    const next = styles && Object.keys(styles).length ? styles : null;
    if (config ? serialize(config.node.attrs.levelStyles) === serialize(next) : !next) return;
    const attrs = Object.assign({ numberingStyle: 'none' }, config && config.node.attrs, { levelStyles: next });
    if (config) tr.setNodeMarkup(config.pos, undefined, attrs);
    else tr.insert(0, state.schema.nodes.headingNumberingConfig.create(attrs));
  }

  // L'état des deux lignes du menu Titre : `level` (celui du titre visé, ou null), `locked` (la clé de la raison du grisage de « Mettre à jour »), `resetLocked` (celle de « Rétablir »).
  function status(editor) {
    const found = target(editor.state);
    if (found.locked) return { level: null, locked: found.locked, resetLocked: found.locked };
    const styles = stylesOf(editor.state.doc);
    return { level: found.level, locked: null, resetLocked: styles && styles[found.level] ? null : 'headingStyle.none' };
  }

  // Les deux lignes du menu à l'état de la sélection : libellé avec le niveau du titre, grisées par aria-disabled et `v2-hover-row-disabled` (comme les autres lignes du menu) avec leur raison pour info-bulle, sorties de
  // l'ordre des tabulations quand elles sont grisées.
  function syncRows(editor, rows) {
    if (!editor || !rows) return;
    const s = status(editor);
    const setRow = (row, locked, key) => {
      if (!row) return;
      const label = I18n.t(s.level ? key : key + '.generic', { level: s.level });
      if (row.textContent !== label) row.textContent = label;
      row.setAttribute('aria-disabled', locked ? 'true' : 'false');
      row.classList.toggle('v2-hover-row-disabled', !!locked);
      row.tabIndex = locked ? -1 : 0;
      if (locked) row.title = I18n.t(locked); else row.removeAttribute('title');
    };
    setRow(rows.update, s.locked, 'headingStyle.update');
    setRow(rows.reset, s.resetLocked, 'headingStyle.reset');
  }

  // « Mettre à jour « Titre N » d'après la sélection » : une seule transaction (un Ctrl+Z la défait d'un coup). Faux, sans rien changer, quand la ligne est grisée, que l'éditeur n'est pas modifiable ou que le style
  // et les titres sont déjà tels que la sélection les donne.
  function update(editor) {
    if (!editor || !editor.isEditable) return false;
    const { state, view } = editor;
    const found = target(state);
    if (found.locked) return false;
    const styles = stylesOf(state.doc) || {};
    const captured = captureStyle(state, found.heading, styles[found.level] || null);
    if (!captured) return false;
    const tr = state.tr;
    stripDirect(tr, state.doc, found.level, captured.set);
    writeStyles(tr, state, Object.assign({}, styles, { [found.level]: captured.style }));
    if (!tr.docChanged) return false;
    view.dispatch(TrackChanges.skipTracking(tr));
    view.focus();
    return true;
  }

  // « Rétablir le style d'origine » : retire le style du niveau du titre visé (la taille et le poids de la balise reviennent). Les titres n'ont plus de mise en forme à la main des réglages du style : ils la perdent à la
  // mise à jour. Une seule transaction.
  function reset(editor) {
    if (!editor || !editor.isEditable) return false;
    const { state, view } = editor;
    const found = target(state);
    const styles = stylesOf(state.doc);
    if (found.locked || !styles || !styles[found.level]) return false;
    const next = Object.assign({}, styles);
    delete next[found.level];
    const tr = state.tr;
    writeStyles(tr, state, next);
    view.dispatch(TrackChanges.skipTracking(tr));
    view.focus();
    return true;
  }

  // --- La barre d'outils ---

  // Le style du titre où est le curseur (celui de son niveau), ou null hors d'un titre ou sans style.
  function styleAt(state) {
    const { $from } = state.selection;
    const styles = $from.parent.type.name === 'heading' ? stylesOf(state.doc) : null;
    return styles ? styles[$from.parent.attrs.level] || null : null;
  }

  // Les réglages de texte que la barre montre (police, taille, couleur, surlignage) : ceux de la sélection, et à défaut ceux du style du titre où elle est - sans quoi la puce de taille disait 10,5 pt sur un titre de 18 pt
  // que le style vient de régler. Hors d'un titre à style, `marked` tel quel.
  function withStyleAt(state, marked) {
    const style = styleAt(state);
    if (!style) return marked;
    const result = Object.assign({}, style);
    Object.keys(marked || {}).forEach((setting) => { if (marked[setting] != null && marked[setting] !== '') result[setting] = marked[setting]; });
    return result;
  }

  return {
    ATTR, LEVELS, normalize, serialize, declarations, apply, createExtension, captureStyle, styleOfMarks, configOf, stylesOf, status, syncRows, update, reset, styleAt, withStyleAt,
  };
})();
