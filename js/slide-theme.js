// Le thème d'une présentation : les couleurs et les polices que toutes ses diapositives prennent d'un seul endroit (demande du 02/11, fil « Ajouter un thème de présentation » ; c'est le préalable d'une
// galerie vraiment belle). Ce fichier est le SOCLE du thème : les données, leur lecture, la façon dont l'éditeur et chaque sortie les montrent, le changement de thème qui recolore le texte. Il ne dépend
// d'aucune extension : une présentation themée s'ouvre, s'exporte et se lit sans le code de l'extension « diapositives », dont seule la fenêtre « Thème… » (extensions/diapositives/slide-theme-ui.js) fait partie.
//
// LES DONNÉES. Le thème est gardé avec la page du modèle, dans le JSON de la colonne Margins (PageLayout, clé `theme`, comme le filigrane) : { v: 1, name?, colors: { text, title, bg, accent1 à accent6 },
// fonts: { title, body } }. Les couleurs sont des #rrggbb en minuscules ; les polices sont les six du menu de police de la barre (FONTS : celles que le PDF, le Word et le PowerPoint savent écrire), sous leur
// nom. Une présentation SANS thème (la clé est absente) est celle d'avant : rien n'est ajouté nulle part, ni à l'écran ni dans un fichier. Un thème lu d'un JSON abîmé ou d'une version plus récente
// retombe sur la valeur d'origine de chaque réglage, jamais sur une erreur (normalize).
//
// L'ÉDITEUR ET LES SORTIES montrent le thème sans rien écrire dans le texte :
//  - à l'écran, `refresh` pose les couleurs et les polices en variables CSS sur :root et la classe `pp-themed` sur <html> ; css/slide-theme.css en tire la police et la couleur du texte et des titres, et le fond de la
//    feuille de l'éditeur et des miniatures. Ce sont des valeurs PAR DÉFAUT : une police ou une couleur choisie sur un mot (une marque du texte), le style d'un niveau de titre (js/heading-styles.js), la couleur d'une
//    forme ou le fond propre d'une diapositive (js/slide-props.js) l'emportent, comme avant ;
//  - dans la Lecture, l'impression, le diaporama et tous les exports, `forOutput` pose les mêmes valeurs en `style` sur les paragraphes et les titres du HTML que SlidesEntry.outputHtml donne (PDF, Word, HTML et
//    PowerPoint les lisent déjà sur n'importe quel élément). Rien n'y remplace un réglage que le bloc porte déjà ou que le style de son niveau de titre porte. Le FOND du thème y est un fond de diapositive posé
//    à chacune qui n'a pas le sien (`paperOf`, option `background` de SlideProps.forOutput : le même cadre de fond sous le texte que pour un fond choisi une à une), sauf pour le blanc ;
//  - le PowerPoint reçoit en plus les couleurs et les polices du thème dans le thème du fichier (js/pptx-export.js) : son fond est celui du masque (`lt1`, peint par `bg1`), sans cadre de fond.
//
// LE CHANGEMENT DE THÈME recolore ce que la personne avait choisi dans les couleurs de l'ancien thème : `remap` remplace, dans une transaction, chaque couleur de texte, de surlignage, de puce, de forme, de case
// de tableau, de bordure et de fond de diapositive qui est celle d'un réglage de l'ancien thème (ou sa nuance plus claire ou plus foncée) par celle du nouveau. Une couleur qui n'est dans aucun thème, composée à la main,
// ne bouge pas ; une police choisie sur un mot non plus.
const SlideTheme = (function () {
  const VERSION = 1;
  const NAME_MAX = 40;
  // Les réglages de couleur, dans l'ordre où la rangée « Couleurs du thème » des menus de couleur les montre : le fond, le texte, les titres, six accents.
  const COLOR_SLOTS = ['bg', 'text', 'title', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
  const ACCENT_SLOTS = COLOR_SLOTS.filter(slot => slot.indexOf('accent') === 0);
  // Les polices : celles du menu de police de la barre (js/main-toolbar.js, FONT_FAMILY_PRESETS), avec la pile CSS que l'éditeur leur donne. Le nom est ce que la marque de texte et les exports lisent.
  const FONTS = [
    { name: 'Roboto', css: "'Roboto', Helvetica, Arial, sans-serif" },
    { name: 'Arial', css: 'Arial, Helvetica, sans-serif' },
    { name: 'Times New Roman', css: "'Times New Roman', Times, serif" },
    { name: 'Georgia', css: 'Georgia, serif' },
    { name: 'Courier New', css: "'Courier New', Courier, monospace" },
    { name: 'Calibri', css: "Calibri, Carlito, 'Segoe UI', sans-serif" },
  ];
  // Les valeurs d'origine de chaque réglage : la couleur du texte de l'éditeur, les six accents du thème que le PowerPoint exporté a toujours porté, la police de l'éditeur.
  const DEFAULT_COLORS = Object.freeze({ bg: '#ffffff', text: '#1b2430', title: '#1b2430', accent1: '#2f6fed', accent2: '#ed7d31', accent3: '#a5a5a5', accent4: '#ffc000', accent5: '#5b9bd5', accent6: '#70ad47' });
  const DEFAULT_FONTS = Object.freeze({ title: 'Roboto', body: 'Roboto' });
  const HEX = /^#[0-9a-f]{6}$/i;
  // La nuance claire et la nuance foncée d'un accent : le fond et le trait d'une forme neuve (comme le bleu clair et le bleu foncé des formes de PowerPoint).
  const LIGHT = 0.8;
  const DARK = 0.25;
  // Les variables CSS que `refresh` pose sur :root, et la classe qui allume les règles de css/slide-theme.css.
  const CLASS = 'pp-themed';
  const VARS = ['--pp-theme-text', '--pp-theme-title', '--pp-theme-bg', '--pp-theme-font-title', '--pp-theme-font-body'].concat(ACCENT_SLOTS.map(slot => '--pp-theme-' + slot));

  const fontOf = value => FONTS.find(font => font.name.toLowerCase() === String(value == null ? '' : value).trim().toLowerCase()) || null;
  const fontCss = name => (fontOf(name) || fontOf(DEFAULT_FONTS.body)).css;

  // Un thème lu de n'importe quelle valeur (objet, ou texte JSON) : le thème borné, ou null quand ce n'en est pas un (une valeur qui n'est pas un objet qui porte des couleurs). Chaque réglage inconnu ou abîmé
  // prend sa valeur d'origine ; les clés sont toujours dans le même ordre (le JSON d'un thème sert à comparer deux thèmes).
  function normalize(value) {
    let data = value;
    if (typeof value === 'string') {
      try { data = JSON.parse(value); } catch (e) { return null; }
    }
    if (!data || typeof data !== 'object' || !data.colors || typeof data.colors !== 'object') return null;
    const colors = {};
    COLOR_SLOTS.forEach((slot) => { colors[slot] = HEX.test(data.colors[slot]) ? data.colors[slot].toLowerCase() : DEFAULT_COLORS[slot]; });
    const given = data.fonts && typeof data.fonts === 'object' ? data.fonts : {};
    const fonts = { title: (fontOf(given.title) || fontOf(DEFAULT_FONTS.title)).name, body: (fontOf(given.body) || fontOf(DEFAULT_FONTS.body)).name };
    const name = typeof data.name === 'string' ? data.name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim() : '';
    return name ? { v: VERSION, name, colors, fonts } : { v: VERSION, colors, fonts };
  }
  const equals = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  // Le nom d'un thème pour l'interface : celui que le modèle lui a gardé, « Personnalisé » à défaut, « Sans thème » pour aucun.
  function displayName(theme) {
    const t = normalize(theme);
    return t ? (t.name || I18n.t('slides.theme.custom')) : I18n.t('slides.theme.none');
  }
  // Le thème d'origine (celui d'une présentation sans thème) : ses réglages sont les valeurs d'origine ci-dessus.
  const original = () => normalize({ colors: DEFAULT_COLORS, fonts: DEFAULT_FONTS });

  // --- Les nuances ---

  function toHsl(hex) {
    const { r, g, b } = ColorMath.toRgb(hex);
    const red = r / 255, green = g / 255, blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const light = (max + min) / 2;
    const delta = max - min;
    let hue = 0;
    let sat = 0;
    if (delta) {
      sat = delta / (1 - Math.abs(2 * light - 1));
      if (max === red) hue = ((green - blue) / delta) % 6;
      else if (max === green) hue = (blue - red) / delta + 2;
      else hue = (red - green) / delta + 4;
      hue = (hue * 60 + 360) % 360;
    }
    return { h: hue, s: sat, l: light };
  }
  function fromHsl({ h, s, l }) {
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const sector = (((h % 360) + 360) % 360) / 60;
    const x = chroma * (1 - Math.abs((sector % 2) - 1));
    const m = l - chroma / 2;
    const [r, g, b] = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]][Math.floor(sector) % 6];
    return ColorMath.toHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
  }
  // La couleur éclaircie de `amount` (0 à 1) vers le blanc, ou assombrie vers le noir : la clarté, en teinte-saturation-clarté, comme les nuances « plus clair 80 % » et « plus foncé 25 % » d'Office.
  const lighten = (hex, amount) => { const hsl = toHsl(hex); return fromHsl({ h: hsl.h, s: hsl.s, l: hsl.l * (1 - amount) + amount }); };
  const darken = (hex, amount) => { const hsl = toHsl(hex); return fromHsl({ h: hsl.h, s: hsl.s, l: hsl.l * (1 - amount) }); };

  // L'aspect d'une forme et d'une ligne neuves quand la présentation a un thème : le fond clair et le trait foncé du premier accent. null sans thème : la forme garde l'aspect d'avant (js/free-frame.js).
  function shapeLook(theme) {
    const t = normalize(theme === undefined ? currentTheme() : theme);
    return t ? { fill: lighten(t.colors.accent1, LIGHT), line: darken(t.colors.accent1, DARK), lw: 1.5 } : null;
  }
  function lineLook(theme) {
    const t = normalize(theme === undefined ? currentTheme() : theme);
    return t ? { line: darken(t.colors.accent1, DARK), lw: 3 } : null;
  }

  // --- L'éditeur ---

  const currentTheme = () => (typeof PageLayout !== 'undefined' ? PageLayout.getTheme() : null);

  // Les variables CSS d'un thème : { '--pp-theme-text': '#1b2430', … }.
  function cssVars(theme) {
    const t = normalize(theme);
    if (!t) return {};
    const vars = { '--pp-theme-text': t.colors.text, '--pp-theme-title': t.colors.title, '--pp-theme-bg': t.colors.bg, '--pp-theme-font-title': fontCss(t.fonts.title), '--pp-theme-font-body': fontCss(t.fonts.body) };
    ACCENT_SLOTS.forEach((slot) => { vars['--pp-theme-' + slot] = t.colors[slot]; });
    return vars;
  }
  // Pose (ou retire) le thème du brouillon de la page sur l'écran : appelée par PageLayout à chaque changement de page. Sans thème, ni variable ni classe : l'éditeur est celui d'avant.
  function refresh() {
    const root = document.documentElement;
    const vars = cssVars(currentTheme());
    VARS.forEach((name) => { if (vars[name]) root.style.setProperty(name, vars[name]); else root.style.removeProperty(name); });
    root.classList.toggle(CLASS, !!Object.keys(vars).length);
  }

  // La police et la couleur que le texte du curseur a PAR DÉFAUT dans une présentation themée (celles des titres dans un titre, celles du texte ailleurs) : ce que la barre d'outils montre quand aucune marque ne les change. null
  // sans thème, et en écriture d'en-tête ou de pied (css/slide-theme.css : l'écran n'y a pas le thème).
  function defaultsAt(state) {
    const t = normalize(currentTheme());
    if (!t || !document.documentElement.classList.contains(CLASS) || (typeof HeaderFooterPreview !== 'undefined' && HeaderFooterPreview.getHfMode())) return null;
    const heading = state.selection.$from.parent.type.name === 'heading';
    return { fontFamily: heading ? t.fonts.title : t.fonts.body, color: heading ? t.colors.title : t.colors.text };
  }

  // --- Les sorties ---

  // Les styles des niveaux de titre que porte le HTML (js/heading-styles.js) : leur police et leur couleur l'emportent sur celles du thème.
  // `root` est un fragment de gabarit : `:scope` n'y désigne rien, le nœud de configuration se cherche parmi ses enfants.
  function levelStylesOf(root) {
    if (typeof HeadingStyles === 'undefined') return {};
    const config = Array.from(root.children).find(el => el.classList.contains('heading-numbering-config'));
    return (config && HeadingStyles.normalize(config.getAttribute(HeadingStyles.ATTR))) || {};
  }
  // Le HTML d'une présentation (celui de SlidesEntry.outputHtml) avec la police et la couleur du thème sur chaque paragraphe et chaque titre qui n'en a pas : le texte de l'éditeur, d'une liste, d'une case ou d'un cadre
  // est toujours un paragraphe ou un titre. Un bloc de code, une légende et un bloc qui porte déjà une police ou une couleur n'y sont pas touchés ; sans thème, le HTML revient tel quel.
  function forOutput(html, theme) {
    const t = normalize(theme);
    if (!html || !t) return html;
    const host = Dom.inertTemplate(html);
    const levels = levelStylesOf(host.content);
    host.content.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach((block) => {
      if (block.closest('pre') || block.hasAttribute('data-caption')) return;
      const heading = /^H[1-6]$/.test(block.tagName);
      const own = (heading && levels[block.tagName.slice(1)]) || {};
      if (!block.style.fontFamily && !own.fontFamily) block.style.fontFamily = heading ? t.fonts.title : t.fonts.body;
      if (!block.style.color && !own.color) block.style.color = heading ? t.colors.title : t.colors.text;
    });
    return host.innerHTML;
  }
  // Le fond que les SORTIES peignent sous les diapositives qui n'ont pas le leur (SlideProps.forOutput, option `background`) : le fond du thème, ou '' tant que c'est le blanc du papier - il n'y a rien à peindre,
  // et les sorties d'une présentation au fond blanc sont exactement celles d'avant. À l'écran, c'est css/slide-theme.css qui peint le même fond (la feuille de l'éditeur, les miniatures).
  function paperOf(theme) {
    const t = normalize(theme);
    return t && t.colors.bg !== DEFAULT_COLORS.bg ? t.colors.bg : '';
  }

  // --- Les menus de couleur ---

  // Les couleurs du thème pour la rangée « Couleurs du thème » : [{ slot, color }] dans l'ordre de COLOR_SLOTS ; vide sans thème.
  function paletteOf(theme) {
    const t = normalize(theme === undefined ? currentTheme() : theme);
    return t ? COLOR_SLOTS.map(slot => ({ slot, color: t.colors[slot] })) : [];
  }

  // --- Le changement de thème ---

  // Les nœuds et les marques où une couleur se garde, par le nom de leur type : les attributs qui portent un #rrggbb (ou, pour une bordure, un texte qui en contient un).
  const NODE_COLOR_ATTRS = {
    listItem: ['bulletColor'], tableHeader: ['backgroundColor', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft'], tableCell: ['backgroundColor', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft'],
    callout: ['color'], freeFrame: ['fill', 'line'], freeLine: ['fill', 'line'], slideProps: ['bg'],
  };
  const MARK_COLOR_ATTRS = { textStyle: ['color', 'backgroundColor'] };

  // La table des couleurs que le passage de `from` à `to` remplace : { ancienne: nouvelle } pour chaque réglage qui change, avec ses deux nuances (celles d'une forme neuve). Quand deux réglages de l'ancien thème
  // ont la même couleur (le texte et les titres), la première des deux dans `order` l'emporte : le texte d'un titre y prend d'abord celle des titres.
  function colorTable(from, to, order) {
    const a = normalize(from) || original();
    const b = normalize(to) || original();
    const table = new Map();
    const add = (before, after) => { if (before !== after && !table.has(before)) table.set(before, after); };
    order.forEach((slot) => {
      add(a.colors[slot], b.colors[slot]);
      if (slot.indexOf('accent') === 0) {
        add(lighten(a.colors[slot], LIGHT), lighten(b.colors[slot], LIGHT));
        add(darken(a.colors[slot], DARK), darken(b.colors[slot], DARK));
      }
    });
    return table;
  }
  // Une couleur de la table peut se garder sous deux formes : « #rrggbb » (le sélecteur de couleur) ou « rgb(r, g, b) » (ce que le navigateur relit d'un style en ligne quand le document est rechargé). Une
  // couleur avec opacité (« rgba(…) ») n'est jamais une couleur du thème : elle ne bouge pas.
  const COLOR_TOKEN = /#[0-9a-f]{6}\b|rgb\(\s*\d{1,3}\s*[, ]\s*\d{1,3}\s*[, ]\s*\d{1,3}\s*\)/gi;
  const lookup = (found, table) => table.get(ColorMath.parseCss(found)) || found;
  // Une valeur de couleur remplacée d'après la table : un #rrggbb, un rgb(r, g, b), ou un texte qui en contient (« 1px solid #cccccc »). La même valeur quand rien ne change ; la valeur remplacée est un #rrggbb.
  function remapValue(value, table) {
    if (typeof value !== 'string' || !value) return value;
    return value.replace(COLOR_TOKEN, found => lookup(found, table));
  }

  // Dans la transaction `tr`, remplace les couleurs de l'ancien thème `from` par celles du nouveau `to` (null : l'aspect d'origine). Aucune position ne bouge : `tr` peut recevoir d'autres pas autour. Rend le nombre
  // de réglages changés.
  function remap(tr, from, to) {
    const slots = COLOR_SLOTS.slice();
    const body = colorTable(from, to, ['text', 'title'].concat(slots.filter(slot => slot !== 'text' && slot !== 'title')));
    const head = colorTable(from, to, ['title', 'text'].concat(slots.filter(slot => slot !== 'text' && slot !== 'title')));
    if (!body.size && !head.size) return 0;
    const schema = tr.doc.type.schema;
    let changes = 0;
    tr.doc.descendants((node, pos, parent) => {
      const table = parent && parent.type.name === 'heading' ? head : body;
      const attrNames = NODE_COLOR_ATTRS[node.type.name];
      if (attrNames) {
        let attrs = null;
        attrNames.forEach((name) => {
          const next = remapValue(node.attrs[name], body);
          if (next !== node.attrs[name]) { attrs = attrs || Object.assign({}, node.attrs); attrs[name] = next; }
        });
        if (attrs) { tr.setNodeMarkup(pos, undefined, attrs, node.marks); changes += 1; }
      }
      if (!node.isInline) return true;
      node.marks.forEach((mark) => {
        const names = MARK_COLOR_ATTRS[mark.type.name];
        if (!names) return;
        let attrs = null;
        names.forEach((name) => {
          const next = remapValue(mark.attrs[name], table);
          if (next !== mark.attrs[name]) { attrs = attrs || Object.assign({}, mark.attrs); attrs[name] = next; }
        });
        if (!attrs) return;
        tr.removeMark(pos, pos + node.nodeSize, mark);
        tr.addMark(pos, pos + node.nodeSize, schema.marks[mark.type.name].create(attrs));
        changes += 1;
      });
      return true;
    });
    return changes;
  }

  return {
    VERSION, NAME_MAX, COLOR_SLOTS, ACCENT_SLOTS, FONTS, DEFAULT_COLORS, DEFAULT_FONTS, CLASS, VARS,
    normalize, equals, displayName, original, fontOf, fontCss, lighten, darken, shapeLook, lineLook, cssVars, refresh, defaultsAt, forOutput, paperOf, paletteOf, remap, colorTable,
  };
})();
