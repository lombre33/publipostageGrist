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
//
// Le style a deux portées (demande du 03/11 : « comme pour les couleurs, on doit pouvoir voir les styles liés au modèle et ceux liés au document »), comme les couleurs (js/color-store.js) et les mises en forme
// gardées (js/format-slots.js) :
//  - le MODÈLE, comme ci-dessus : le style voyage avec lui ;
//  - le DOCUMENT Grist, pour tous ses modèles et toute l'équipe : la ligne réservée aux réglages du document de la table des modèles (Templates.getDocumentSetting, clé `headingStyles`, la même forme
//    { "1": style … "6": style }), sans table de plus. Le changement vaut tout de suite pour les lecteurs et s'écrit dans Grist ensuite ; un refus (droits, connexion) se dit dans le coin d'état et rend l'ancien style.
// Le style d'un niveau est celui du modèle quand il en a un, à défaut celui du document - niveau par niveau : un modèle qui ne règle que « Titre 1 » prend le « Titre 2 » du document. Le menu Titre montre les deux blocs,
// « Styles de titres du modèle » et « Styles de titres partagés », chacun avec l'aperçu de ses niveaux et ses deux lignes (mettre à jour, rétablir). Le style du document se lit partout comme celui du modèle : l'éditeur
// (la décoration suit les réglages du document, `pp:documentSettingsChanged`), la Lecture, l'impression, le diaporama et les exports (`effective`).
// Mettre à jour le style partagé retire, des titres du niveau de CE modèle, la mise en forme à la main que le style porte - sauf quand le modèle a son propre style de ce niveau, qui l'emporte ici et que le geste ne
// touche pas. Un seul Ctrl+Z défait le geste (repère HistoryMarkers, domaine « headingDocStyles », joint à la transaction qui retire la mise en forme à la main) ; il ne touche qu'aux niveaux que le geste a changés, et
// jamais par-dessus un style que quelqu'un d'autre a changé depuis. Comme tout repère, il se perd quand un autre modèle est chargé.
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
    let parsed = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch (e) { return null; }
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const styles = {};
    LEVELS.forEach((level) => {
      const style = cleanStyle(parsed[level]);
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
  // Les styles que le MODÈLE écrit lui-même (son nœud de configuration), sans ceux du document : voir `effective`.
  const stylesOf = doc => { const config = configOf(doc); return (config && config.node.attrs.levelStyles) || null; };

  // --- Les styles du document (partagés par tous ses modèles) ---

  // La clé du réglage du document (Templates.getDocumentSetting).
  const SETTING = 'headingStyles';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const copy = value => (value ? JSON.parse(JSON.stringify(value)) : value);
  // Où dire ce qui se passe (le coin d'état de la page, js/main.js) : `status(texte, erreur)`.
  let host = { status: () => {} };
  function wire(options) { host = Object.assign({}, host, options); }

  // Les styles de niveau du document, relus d'un JSON qu'une autre version ou une autre personne a pu écrire (`normalize`) ; null quand il n'y en a pas (ou hors d'une page qui lit les modèles). Gardés tant que le
  // réglage ne change pas, la barre d'outils les relisant à chaque mise à jour de la sélection : un objet à ne jamais modifier.
  let shared = { key: '', styles: null };
  function documentStyles() {
    if (typeof Templates === 'undefined' || typeof Templates.getDocumentSetting !== 'function') return null;
    const raw = Templates.getDocumentSetting(SETTING);
    const key = raw === undefined ? '' : JSON.stringify(raw);
    if (key !== shared.key) shared = { key, styles: normalize(raw) };
    return shared.styles;
  }

  // Le style de chaque niveau tel qu'un modèle le montre : le sien (`modelStyles`, ce que son nœud de configuration écrit), à défaut celui du document. null quand aucun niveau n'a de style. Un objet à ne pas modifier.
  function effective(modelStyles) {
    const common = documentStyles();
    if (!common) return modelStyles || null;
    return modelStyles ? Object.assign({}, common, modelStyles) : common;
  }
  const effectiveOf = doc => effective(stylesOf(doc));
  // Le point de départ du style d'un niveau qu'on met à jour : celui que le titre montre déjà (le style du modèle, à défaut celui du document), pour que le style neuf garde son aspect et y ajoute ce que la sélection pose.
  const baseOf = (own, level) => (own && own[level]) || (documentStyles() || {})[level] || null;

  // --- Le HTML résolu (Lecture, impression, diaporama, exports) ---

  // Pose sur chaque <h1> à <h6> de `root` le style de son niveau, d'après le nœud de configuration que `root` porte à sa racine et les styles du document ; rend le nombre de titres mis en forme. Un réglage que le titre
  // porte déjà en ligne (son `text-align`) n'est pas remplacé.
  function apply(root) {
    const config = root.querySelector(':scope > .heading-numbering-config');
    const styles = effective(config ? normalize(config.getAttribute(ATTR)) : null);
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
      const styles = effectiveOf(doc);
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
            // Le texte change, ou les styles du document (la méta du plugin, voir `view`) : les décorations se refont.
            apply: (tr, set, oldState, newState) => (tr.docChanged || tr.getMeta(key) ? decorationsOf(newState.doc) : set),
          },
          props: { decorations: state => key.getState(state) },
          // Les styles du document changent (une écriture d'ici ou d'une autre personne, le retour arrière d'une écriture refusée, un Annuler) : l'éditeur les montre tout de suite. Une transaction qui ne touche ni au texte
          // ni à l'historique ni à l'enregistrement automatique, seulement aux décorations.
          view: (view) => {
            const onSettings = () => {
              if (view.isDestroyed) return;
              view.dispatch(view.state.tr.setMeta(key, 'refresh').setMeta('addToHistory', false).setMeta('preventUpdate', true));
            };
            document.addEventListener('pp:documentSettingsChanged', onSettings);
            return { destroy: () => document.removeEventListener('pp:documentSettingsChanged', onSettings) };
          },
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

  // --- Le geste sur le style partagé, dans Ctrl + Z ---

  // Écrit les styles du document dans ses réglages (un objet sans niveau retire la clé). Le changement vaut tout de suite pour les lecteurs ; la promesse rend vrai quand Grist l'a écrit, faux sinon (droits, connexion) :
  // le coin d'état le dit, et les lecteurs retrouvent les derniers styles que Grist a confirmés.
  // `failedKey` : le texte du coin d'état quand Grist refuse, ou une fonction qui le donne au moment du refus (le geste qui a aussi retiré de la mise en forme à la main des titres le dit).
  function writeShared(styles, failedKey) {
    const saved = Templates.updateDocumentSettings({ [SETTING]: normalize(styles) });
    Promise.resolve(saved).then((ok) => {
      if (ok === false) host.status(I18n.t(typeof failedKey === 'function' ? failedKey() : failedKey || 'headingStyle.status.documentFailed'), true);
    });
    return saved;
  }

  // Le repère de Ctrl + Z du style partagé (js/history-markers.js) : les styles du document avant et après le geste. Annuler et Rétablir ne rendent que les niveaux que le geste a changés, et seulement tant que le
  // document les a encore tels que le geste les a laissés - jamais par-dessus le changement de quelqu'un d'autre (le coin d'état le dit).
  const DOMAIN = 'headingDocStyles';
  const sharedSnapshot = () => copy(documentStyles()) || {};
  function restoreShared(next, prev) {
    const current = sharedSnapshot();
    const merged = Object.assign({}, current);
    let changed = false;
    let moved = false;
    LEVELS.forEach((level) => {
      if (same(next[level], prev[level]) || same(current[level], next[level])) return;
      if (!same(current[level], prev[level])) { moved = true; return; }
      if (next[level]) merged[level] = next[level]; else delete merged[level];
      changed = true;
    });
    // Après la transaction de l'historique qui nous appelle : le texte qu'elle rend fait dire au coin d'état l'état de l'enregistrement (js/main.js:updateSaveStatus), qui couvrirait ce message.
    if (moved) Promise.resolve().then(() => host.status(I18n.t('headingStyle.status.changedSince'), true));
    if (changed) writeShared(merged);
  }
  if (typeof HistoryMarkers !== 'undefined') HistoryMarkers.define(DOMAIN, { read: sharedSnapshot, write: restoreShared });
  // Le geste, rangé dans l'historique de l'éditeur : joint à la transaction qui retire la mise en forme à la main des titres quand il en a ouvert une, sinon un événement à lui. Un seul Ctrl + Z dans les deux cas.
  const trackShared = work => (typeof HistoryMarkers !== 'undefined' ? HistoryMarkers.track(DOMAIN, work) : work());

  // --- Les lignes du menu Titre ---

  // L'état des lignes du menu Titre. Pour le modèle : `level` (celui du titre visé, ou null), `locked` (la clé de la raison du grisage de « Mettre à jour »), `resetLocked` (celle de « Rétablir »). Pour le style partagé,
  // les deux mêmes dans `document` : « Rétablir » n'a rien à retirer quand le document n'a pas de style à ce niveau.
  function status(editor) {
    const found = target(editor.state);
    if (found.locked) return { level: null, locked: found.locked, resetLocked: found.locked, document: { locked: found.locked, resetLocked: found.locked } };
    const own = stylesOf(editor.state.doc);
    const common = documentStyles();
    return {
      level: found.level,
      locked: null,
      resetLocked: own && own[found.level] ? null : 'headingStyle.none',
      document: { locked: null, resetLocked: common && common[found.level] ? null : 'headingStyle.document.none' },
    };
  }

  // L'aperçu d'un niveau dans l'intitulé de son bloc : sa police, sa couleur, son italique, son souligné et son surlignage, sur le blanc de la page, à une taille de menu (la taille du style est dite dans l'infobulle).
  function chipLook(style) {
    const found = [];
    if (style.fontFamily) found.push('font-family: ' + style.fontFamily);
    if (style.color) found.push('color: ' + style.color);
    if (style.italic) found.push('font-style: italic');
    const lines = [style.underline && 'underline', style.strike && 'line-through'].filter(Boolean);
    if (lines.length) found.push('text-decoration: ' + lines.join(' '));
    if (style.backgroundColor) found.push('background-color: ' + style.backgroundColor);
    return found.join('; ');
  }
  // Le style d'un niveau en mots, pour l'infobulle de son aperçu : « Titre 1 · Georgia · 18pt · #1f4e79 · Italique », et ce qui le lie à l'autre bloc (`note` : `overrides` pour le style du modèle qui remplace celui du
  // document, `masked` pour celui du document qu'un style du modèle remplace).
  function describe(entry) {
    const style = entry.style;
    const family = style.fontFamily ? style.fontFamily.split(',')[0].replace(/["']/g, '').trim() : '';
    const parts = [
      I18n.t('heading.level' + entry.level), family, style.fontSize, style.color,
      style.italic && I18n.t('fmt.italic'), style.underline && I18n.t('fmt.underline'), style.strike && I18n.t('fmt.strike'),
      style.textAlign && I18n.t('headingStyle.align.' + style.textAlign),
    ].filter(Boolean);
    return parts.join(' · ') + (entry.note ? ' — ' + I18n.t('headingStyle.note.' + entry.note) : '');
  }
  function chipOf(entry) {
    const chip = Dom.el('span', 'pp-hs-chip' + (entry.note === 'masked' ? ' is-masked' : ''), I18n.t('heading.level' + entry.level));
    const look = chipLook(entry.style);
    if (look) chip.setAttribute('style', look);
    chip.title = describe(entry);
    return chip;
  }
  // Redessine la ligne d'aperçu d'un bloc, seulement quand ce qu'elle montre (la langue, les niveaux et leurs styles) a changé : le menu garde son dessin d'une mise à jour de la barre à l'autre.
  function drawLevels(box, entries) {
    if (!box) return;
    const signature = JSON.stringify([I18n.getLang(), entries]);
    if (box.dataset.drawn === signature) return;
    box.dataset.drawn = signature;
    box.textContent = '';
    box.append(...(entries.length ? entries.map(chipOf) : [Dom.el('span', 'pp-hs-none', I18n.t('headingStyle.scope.none'))]));
  }
  // Les niveaux à montrer de chaque bloc : ceux du modèle (`overrides` quand le document a aussi un style de ce niveau) et ceux du document (`masked` quand le modèle a le sien : il l'emporte ici).
  function levelsOf(doc) {
    const own = stylesOf(doc) || {};
    const common = documentStyles() || {};
    return {
      model: LEVELS.filter(level => own[level]).map(level => ({ level, style: own[level], note: common[level] ? 'overrides' : '' })),
      document: LEVELS.filter(level => common[level]).map(level => ({ level, style: common[level], note: own[level] ? 'masked' : '' })),
    };
  }

  // Les lignes du menu à l'état de la sélection : libellé avec le niveau du titre, grisées par aria-disabled et `v2-hover-row-disabled` (comme les autres lignes du menu) avec leur raison pour info-bulle, sorties de
  // l'ordre des tabulations quand elles sont grisées. `rows` : { update, reset } pour le modèle, { documentUpdate, documentReset } pour le style partagé, et les éléments des deux blocs - { modelScope, documentScope }
  // (intitulés : leur infobulle dit où vit chaque style) et { modelLevels, documentLevels } (l'aperçu des niveaux qui ont un style). Chaque élément est facultatif.
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
    setRow(rows.documentUpdate, s.document.locked, 'headingStyle.document.update');
    setRow(rows.documentReset, s.document.resetLocked, 'headingStyle.document.reset');
    [[rows.modelScope, 'headingStyle.scope.model.hint'], [rows.documentScope, 'headingStyle.scope.document.hint']].forEach(([head, hint]) => {
      if (head && head.title !== I18n.t(hint)) head.title = I18n.t(hint);
    });
    if (rows.modelLevels || rows.documentLevels) {
      const levels = levelsOf(editor.state.doc);
      drawLevels(rows.modelLevels, levels.model);
      drawLevels(rows.documentLevels, levels.document);
    }
  }

  // --- Les gestes ---

  // « Mettre à jour « Titre N » d'après la sélection » : le style de CE modèle. Une seule transaction (un Ctrl+Z la défait d'un coup). Faux, sans rien changer, quand la ligne est grisée, que l'éditeur n'est pas modifiable
  // ou que le style et les titres sont déjà tels que la sélection les donne. Le point de départ est le style que le niveau montre déjà (celui du modèle, à défaut celui du document : `baseOf`).
  function updateModel(editor) {
    if (!editor || !editor.isEditable) return false;
    const { state, view } = editor;
    const found = target(state);
    if (found.locked) return false;
    const styles = stylesOf(state.doc) || {};
    const captured = captureStyle(state, found.heading, baseOf(styles, found.level));
    if (!captured) return false;
    const tr = state.tr;
    stripDirect(tr, state.doc, found.level, captured.set);
    writeStyles(tr, state, Object.assign({}, styles, { [found.level]: captured.style }));
    if (!tr.docChanged) return false;
    view.dispatch(TrackChanges.skipTracking(tr));
    view.focus();
    return true;
  }

  // « Mettre à jour « Titre N » (partagé) d'après la sélection » : le style du niveau, écrit dans les réglages du document - tous ses modèles et toute l'équipe le prennent. Les titres de ce modèle perdent la mise en forme à
  // la main des réglages que la sélection pose, sauf quand le modèle a son propre style de ce niveau : il l'emporte ici, rien n'y change. Un seul Ctrl + Z défait le geste. Faux, sans rien changer, quand la ligne est grisée,
  // que l'éditeur n'est pas modifiable ou que le style partagé et les titres sont déjà tels que la sélection les donne.
  function updateShared(editor) {
    if (!editor || !editor.isEditable) return false;
    const { state, view } = editor;
    const found = target(state);
    if (found.locked) return false;
    const own = stylesOf(state.doc) || {};
    const common = documentStyles() || {};
    const captured = captureStyle(state, found.heading, baseOf(own, found.level));
    if (!captured) return false;
    const next = Object.assign({}, common, { [found.level]: captured.style });
    const changesShared = !same(next, common);
    const masked = !!own[found.level];
    // Si Grist refuse le style, les titres ont déjà perdu leur mise en forme à la main : le coin d'état dit que Ctrl + Z la rend.
    let stripped = false;
    const done = trackShared(() => {
      if (changesShared) writeShared(next, () => (stripped ? 'headingStyle.status.documentFailedStripped' : 'headingStyle.status.documentFailed'));
      if (masked) return changesShared;
      const tr = editor.state.tr;
      stripDirect(tr, editor.state.doc, found.level, captured.set);
      if (!tr.docChanged) return changesShared;
      stripped = true;
      view.dispatch(TrackChanges.skipTracking(tr));
      return true;
    });
    if (!done) return false;
    view.focus();
    host.status(I18n.t(masked ? 'headingStyle.status.documentMasked' : 'headingStyle.status.documentUpdated', { level: found.level }), false);
    return true;
  }

  // « Mettre à jour » : `scope` 'document' pour le style partagé, le modèle sinon.
  function update(editor, scope) { return scope === 'document' ? updateShared(editor) : updateModel(editor); }

  // « Rétablir le style d'origine » du modèle : retire le style du niveau du titre visé (la taille et le poids de la balise reviennent, ou le style du document s'il en a un). Les titres n'ont plus de mise en forme à la
  // main des réglages du style : ils la perdent à la mise à jour. Une seule transaction.
  function resetModel(editor) {
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

  // « Rétablir le style d'origine » du style partagé : retire le style du niveau du titre visé des réglages du document. Les titres des modèles qui n'ont pas le leur reprennent l'aspect de leur balise. Un seul Ctrl + Z.
  function resetShared(editor) {
    if (!editor || !editor.isEditable) return false;
    const found = target(editor.state);
    const common = documentStyles();
    if (found.locked || !common || !common[found.level]) return false;
    const next = Object.assign({}, common);
    delete next[found.level];
    trackShared(() => writeShared(next));
    editor.view.focus();
    host.status(I18n.t('headingStyle.status.documentReset', { level: found.level }), false);
    return true;
  }

  // « Rétablir » : `scope` 'document' pour le style partagé, le modèle sinon.
  function reset(editor, scope) { return scope === 'document' ? resetShared(editor) : resetModel(editor); }

  // --- La barre d'outils ---

  // Le style du titre où est le curseur (celui de son niveau : le style du modèle, à défaut celui du document), ou null hors d'un titre ou sans style.
  function styleAt(state) {
    const { $from } = state.selection;
    const styles = $from.parent.type.name === 'heading' ? effectiveOf(state.doc) : null;
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
    ATTR, SETTING, LEVELS, normalize, serialize, declarations, apply, createExtension, captureStyle, styleOfMarks, configOf, stylesOf, documentStyles, effective, effectiveOf, wire, status, syncRows, update, reset, styleAt,
    withStyleAt,
  };
})();
